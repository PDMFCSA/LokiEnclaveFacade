const {normalizeNumber, validateSort, buildSelector, DBKeys, pruneOpenDSUFields, remapObject} = require("../utils");
const logger = $$.getLogger("DBService");
const nano = require("nano");
const {OpenDSUKeys} = require("../utils/constants");
const {processInChunks} = require("../utils/chunk");

/**
 * DBService for database operations.
 * This class provides a generic interface to interact with any database.
 * **Initially configured for CouchDB.**
 */
class DBService {
    /**
     * @param {{uri: string, username?: string, secret?: string}} config - Configuration object containing database connection details.
     */
    constructor(config) {
        this.config = config;
        this.dbConnection = this.__createConnection(config);
    }

    /**
     * Creates and returns a database client based on the provided configuration.
     * @param {{uri: string, username?: string, secret?: string}} config - Configuration object containing database connection details.
     * @returns {nano.ServerScope} - A database client instance.
     */
    __createConnection(config) {
        if (this.dbConnection)
            return this.dbConnection;

        const url = new URL(config.uri);
        if (url.username && url.password)
            logger.warn("Passing credentials in the URI is convenient but not secure. Consider pass them as parameters for cookie authentication for better security (https://guide.couchdb.org/editions/1/en/security.html#cookies).");

        const username = config.username || url.username || "";
        const password = config.secret || url.password || "";

        this.dbConnection = nano({
            url: config.uri,
            requestDefaults: {auth: {username, password}}
        });

        return this.dbConnection;
    }

    /**
     * Checks if DB Name is valid for couch db.
     * @param {string} dbName
     * @returns {boolean} - `true` if the database name is valid, `false` otherwise.
     */
    isValidCouchDbName (dbName) {
        const couchDbNameRegex = /^[a-z][a-z0-9_\$\(\)\+\-]{0,254}$/;
        return couchDbNameRegex.test(dbName);
    }

    /**
     * Converts to lower case and checks if DB Name is valid for couch db.
     * @param {string} dbName
     * @returns {string} - dbName if the database name is valid, `false` otherwise.
     */
    changeDBNameToLowerCaseAndValidate(dbName){
        dbName =  dbName.toLowerCase().replaceAll(':', '_').replaceAll(".", "-");

        if(!this.isValidCouchDbName(dbName)) {
            const message = `Invalid db name "${dbName}". Only lowercase characters (a-z), digits (0-9), and any of the characters _, $, (, ), +, -, and / are allowed. Must begin with a letter.`
            logger.error(message);
            throw new Error(message);
        }

        return dbName;
    }
    
    /**
     * Checks if a database exists.
     * @param {string} dbName
     * @returns {Promise<boolean>} - `true` if the database exists, `false` otherwise.
     */
    async dbExists(dbName) {
        try {
            dbName = this.changeDBNameToLowerCaseAndValidate(dbName);
            const dbList = await this.dbConnection.db.list();
            return dbList.includes(dbName);
        } catch (error) {
            this._testErrorForShutdown(error);
            logger.error(`Failed to check if database "${dbName}" exists:`, error);
            return false;
        }
    }

    /**
     * Creates a new database with the specified name and indexes if it doesn't already exist.
     *
     * @param {string} dbName - The name of the database to be created.
     * @param {Array<string>} [indexes] - The fields to be indexed.
     * @returns {Promise<boolean>}
     * @throws {Error} - Throws an error if database creation already exists or database/indexes creation fails.
     */
    async createDatabase(dbName, indexes = []) {
        try {
            dbName = this.changeDBNameToLowerCaseAndValidate(dbName);
            if (await this.dbExists(dbName)) {
                logger.info(`Database "${dbName}" already exists. Skipping creation...`);
                return true;
            }

            await this.dbConnection.db.create(dbName);
            logger.info(`Database "${dbName}" created successfully.`);

            const indexList = Array.isArray(indexes) && indexes.length ? indexes : [DBKeys.TIMESTAMP];
            await this.addIndex(dbName, indexList);

            return true;
        } catch (err) {
            this._testErrorForShutdown(err);
            logger.error(`Fail creating database or adding indexes for "${dbName}".`);
            throw err;
        }
    }

    /**
     * Retrieves an existing database, or creates it if it does not exist.
     *
     * @param {string} dbName - Database name to retrieve or create.
     * @returns {Promise<nano.DocumentScope>} A Promise that resolves to database instance.
     * @throws {Error} Throws an error if the database retrieval or creation process fails.
     */
    async openDatabase(dbName) {
        try {
            dbName = this.changeDBNameToLowerCaseAndValidate(dbName);
            if (await this.dbExists(dbName))
                return this.dbConnection.use(dbName);

            logger.info(`Database does not exist. Creating new database "${dbName}".`);
            await this.createDatabase(dbName);
            // TODO - Remove, return DBService instance
            return this.dbConnection.use(dbName);
        } catch (error) {
            this._testErrorForShutdown(error);
            logger.error(`Error in openDatabase: ${error.message || error}`);
            throw error;
        }
    }

    /**
     * Deletes a database.
     * @param {string} dbName - The name of the database to delete.
     * @returns {Promise<boolean>} - True if the database was successfully deleted.
     */
    async deleteDatabase(dbName) {
        try {
            dbName = this.changeDBNameToLowerCaseAndValidate(dbName);
            await this.dbConnection.db.destroy(dbName);
            return true;
        } catch (error) {
            this._testErrorForShutdown(error);
            if (error.status === 404) {
                logger.warn(`Database "${dbName}" does not exist. No deletion required.`);
                return true;
            }

            logger.error(`Error deleting database ${dbName}:`, error);
            throw error;
        }
    }

    /**
     * Lists all databases and optionally includes detailed information about each one.
     *
     * @param {boolean} verbose - If true, returns information about each database, including document count.
     * @returns {Promise<Array<string> | Array<{ name: string, type: string, count: number }>>}
     * @throws {Error} - Throws an error if fetching database information fails.
     */
    async listDatabases(verbose = false) {
        const self = this;
        try {
            const list = await this.dbConnection.db.list();
            if (!verbose)
                return list;

            const databaseInfoList = [];
            for (const dbName of list) {
                const metadata = await self.dbConnection.use(dbName).info(); // Get metadata of the database
                databaseInfoList.push({
                    name: dbName,
                    type: "collection",
                    count: metadata.doc_count || 0
                });
            }
            return databaseInfoList;
        } catch (error) {
            this._testErrorForShutdown(error);
            logger.error('Error listing databases:', error);
            throw error;
        }
    }

    /**
     * Test is the error is worth shutting down the system for
     * @param {Error} error
     * @returns {void}
     */
    _testErrorForShutdown(error){
        if (error.message.includes("ECONNREFUSED")){
            logger.error("Failed to connect to couchdb instance. Shutting down the system...");
            process.exit(1);
        }
    }

    /**
     * Retrieves the document count for a specific table
     *
     * @param {string} tableName - The table name to get the document count
     * @returns {Promise<number>} - A promise that resolves to the document count of the specified table.
     * @throws {Error} - Throws an error if retrieving the document count fails.
     */
    async countDocs(tableName) {
        try {
            const info = await this.dbConnection.db.use(tableName).info();
            return info.doc_count || 0;
        } catch (error) {
            if (error.statusCode === 404) {
                logger.warn(`Table "${tableName}" does not exist. Unable to count documents.`);
                return 0;
            }
            logger.error(`Failed to retrieve document count for table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Adds indexes to a specific table.
     *
     * @param {string} tableName - The name of the table to add the index to.
     * @param {string | Array<string>} properties - The property or property list to be indexed.
     * @returns {Promise<boolean>} - Resolves to `true` if the index was successfully created.
     * @throws {Error} - Throws an error if the table doesn't exist or if adding the index fails.
     */
    async addIndex(tableName, properties) {
        if (!properties || (Array.isArray(properties) && properties.length === 0)) {
            logger.info(`No indexes provided for table: ${tableName}. Skipping index creation.`);
            return false;
        }

        if (!await this.dbExists(tableName))
            throw new Error(`Table "${tableName}" does not exist.`);

        properties = Array.isArray(properties) ? properties : [properties];
        const index = `${properties.join("_")}_index`;
        try {
            await this.dbConnection.use(tableName).createIndex({
                name: index,
                index: {
                    fields: properties
                },
                type: "json" // default
            });

            logger.info(`Added index ${index} for table "${tableName}".`);
            return true;
        } catch (err) {
            logger.error(`Could not add index ${index} on ${tableName}.`);
            throw new Error(`Could not add index ${index} on ${tableName}: ${err.message}`);
        }
    }

    /**
     * Inserts a document into a specified table.
     * @param {string} tableName
     * @param {string} _id - The primary key for the record.
     * @param {Object} document - The document to insert.
     * @returns {Promise<{ [key: string]: any }>} - The inserted document.
     * @throws {Error} - Throws an error if any operation fails, including checking if the record exists or inserting the record.
     */
    async insertDocument(tableName, _id, document) {
        // TODO - Empty objects {} are not being validated.
        try {
            await this.openDatabase(tableName);
            const record = await this.readDocument(tableName, _id).catch(() => undefined);
            if (record)
                throw new Error(`A record with PK "${_id}" already exists in ${tableName}`);

            const insert = {
                ...pruneOpenDSUFields(document),
                [DBKeys.PK]: _id,
                [DBKeys.TIMESTAMP]: Date.now()
            };

            const {id} = await this.dbConnection.use(tableName).insert(insert);
            return this.readDocument(tableName, id);
        } catch (err) {
            logger.error(err);
            throw err;
        }
    }

    /**
     * Retrieves a document by its ID from the specified table.
     * @param {string} tableName
     * @param {string} _id - The ID of the document to retrieve.
     * @returns {Promise<{ pk: string, [key: string]: any }>} - The retrieved document.
     */
    async readDocument(tableName, _id) {
        try {
            await this.openDatabase(tableName);
            const document = await this.dbConnection.use(tableName).get(_id);
            return remapObject(document);
        } catch (error) {
            if (error.statusCode !== 404)
                logger.error(`Failed to retrieve document ${_id} from table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Updates a record in the specified table.
     * If the record does not exist and the `fallbackInsert` flag is set to true, it will insert the record instead.
     *
     * @param {string} tableName
     * @param {string} _id - The ID of the document to update.
     * @param {Object} document - The record data to update.
     * @returns {Promise<{ [key: string]: any }>} - The updated or inserted record.
     * @throws {Error} - If the operation fails.
     */
    async updateDocument(tableName, _id, document) {
        try {
            const dbClient = this.dbConnection.use(tableName);
            const dbRecord = await dbClient.get(_id);
            const _rev = dbRecord[DBKeys.REV];
            for (let prop in document) {
                dbRecord[prop] = document[prop];
            }

            const update = {
                ...pruneOpenDSUFields(dbRecord),
                [DBKeys.PK]: _id,
                [DBKeys.REV]: _rev,
                [DBKeys.TIMESTAMP]: Date.now()
            };

            const response = await dbClient.insert(update);
            return await this.readDocument(tableName, response.id);
        } catch (error) {
            if (error.statusCode === 404) {
                if (document[OpenDSUKeys.FALLBACK_INSERT]) {
                    delete document[OpenDSUKeys.FALLBACK_INSERT];
                    return this.insertDocument(tableName, _id, document);
                }
                throw new Error(`Failed to update document "${_id}" from "${tableName}": Not found.`);
            }

            logger.error(`Failed to update document "${_id}" from "${tableName}":`, error);
            throw error;
        }
    }

    /**
     * Deletes a record from the specified table.
     * @param {string} tableName
     * @param {string} _id - The primary key (ID) of the record to delete.
     * @returns {Promise<{ pk: string }>} - The deleted record.
     * @throws {Error} - If the operation fails.
     */
    async deleteDocument(tableName, _id) {
        try {
            const dbClient = this.dbConnection.use(tableName);
            const document = await dbClient.get(_id);
            await dbClient.destroy(_id, document[DBKeys.REV]);
            return {[OpenDSUKeys.PK]: _id};
        } catch (error) {
            if (error.statusCode === 404)
                return {[OpenDSUKeys.PK]: _id};

            logger.error(`Error deleting document ${_id} from table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Lists documents from a specified table.
     *
     * @param {string} tableName - The name of the table to fetch documents from.
     * @param {Object} [options={}] - Optional configuration object for listing documents.
     * @param {number} [options.limit] - The maximum number of documents to fetch (optional).
     * @returns {Promise<Array<{ [key: string]: any }>>} - A promise that resolves to an array of document objects.
     * @throws {Error} - Throws an error if the query fails.
     */
    async listDocuments(tableName, options = {}) {
        const {limit} = options;
        tableName = this.changeDBNameToLowerCaseAndValidate(tableName);

        try {
            await this.openDatabase(tableName);
            const queryOptions = {
                include_docs: true,
                startkey: '',
                endkey: '_design/',
                inclusive_end: false // Exclude design docs
            };

            if (limit && Number.isInteger(limit) && limit > 0)
                queryOptions.limit = limit;

            const response = await this.dbConnection.use(tableName).list(queryOptions);
            return processInChunks(response.rows, 2, (row) => remapObject(row.doc));
        } catch (error) {
            logger.error(`Error listing documents from table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Filters documents from specified table.
     *
     * @async
     * @param {string} tableName - The name of the table to query.
     * @param {Array<string>} query - The query object to filter documents.
     * @param {Array<Object>} [sort=[]] - Sorting criteria for the results.
     * @param {number} [limit=undefined] - Maximum number of documents to return.
     * @param {number} [skip=0] - Number of documents to skip before returning results.
     * @returns {Promise<Array<Object>>}g.
     * @throws {Error} If there is an issue querying the database.
     */
    async filter(tableName, query, sort = [], limit = undefined, skip = 0) {
        tableName = this.changeDBNameToLowerCaseAndValidate(tableName);
        limit = normalizeNumber(limit, 1, undefined);
        skip = normalizeNumber(skip, 0, 0);
        sort = validateSort(sort);

        const selector = buildSelector(query);
        const mangoQuery = {
            selector,
            // fields: [],
            sort,
            skip,
            ...(limit ? {limit} : {})
        };

        try {
            const result = await this.dbConnection.use(tableName).find(mangoQuery);
            return processInChunks(result.docs, 2, (doc) => remapObject(doc));
        } catch (error) {
            logger.error(`Error filtering documents from table ${tableName}:`, error);
            throw error;
        }
    }

}

module.exports = {DBService};

