const {normalizeNumber, validateSort, buildSelector, DBKeys, pruneOpenDSUFields, remapObject} = require("../utils");
const logger = $$.getLogger("DBService");
const nano = require("nano");
const {OpenDSUKeys} = require("../utils/constants");

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
        this.dbClient = this._createDBClient(config);
    }

    /**
     * Creates and returns a database client based on the provided configuration.
     * @param {{uri: string, username?: string, secret?: string}} config - Configuration object containing database connection details.
     * @returns {nano.ServerScope} - A database client instance.
     */
    _createDBClient(config) {
        if (this.dbClient)
            return this.dbClient;

        const url = new URL(config.uri);
        if (url.username && url.password)
            logger.warn("Passing credentials in the URI is convenient but not secure. Consider pass them as parameters for cookie authentication for better security (https://guide.couchdb.org/editions/1/en/security.html#cookies).");

        const username = config.username || url.username || "";
        const password = config.secret || url.password || "";

        this.dbClient = nano({
            url: config.uri,
            requestDefaults: {auth: {username, password}}
        });

        return this.dbClient;
    }

    /**
     * Checks if a database exists.
     * @param {string} dbName
     * @returns {Promise<boolean>} - `true` if the database exists, `false` otherwise.
     */
    async dbExists(dbName) {
        try {
            await this.dbClient.db.get(dbName);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Creates a new database with the specified name and indexes if it doesn't already exist.
     *
     * @param {string} dbName - The name of the database to be created.
     * @param {Array<string>} indexes - The fields to be indexed.
     * @returns {Promise<boolean>}
     * @throws {Error} - Throws an error if database creation already exists or database/indexes creation fails.
     */
    async createDatabase(dbName, indexes) {
        try {
            if (await this.dbExists(dbName))
                throw new Error(`Database "${dbName}" already exists.`);

            await this.dbClient.db.create(dbName);
            logger.info(`Database "${dbName}" created successfully.`);

            await this.addIndex(dbName, indexes);

            return true;
        } catch (err) {
            logger.error(`Error creating database or adding indexes for "${dbName}".`);
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
            if (await this.dbExists(dbName))
                return this.dbClient.use(dbName);

            logger.info(`Database does not exist. Creating new database "${dbName}"...`);
            await this.createDatabase(dbName);
            return this.dbClient.use(dbName);
        } catch (error) {
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
            await this.dbClient.destroy(dbName);
            return true;
        } catch (error) {
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
            const list = await this.dbClient.db.list();
            if (!verbose)
                return list;

            const databaseInfoList = [];
            for (const dbName of list) {
                const metadata = await self.dbClient.use(dbName).info(); // Get metadata of the database
                databaseInfoList.push({
                    name: dbName,
                    type: "collection",
                    count: metadata.doc_count || 0
                });
            }
            return databaseInfoList;
        } catch (error) {
            logger.error('Error listing databases:', error);
            throw error;
        }
    }

    /**
     * Retrieves the document count for a specific table
     *
     * @param {string} tableName - The name of the table (or database) to retrieve the document count for.
     * @returns {Promise<number>} - A promise that resolves to the document count of the specified table.
     * @throws {Error} - Throws an error if retrieving the document count fails.
     */
    async countDocs(tableName) {
        try {
            const info = await this.dbClient.db.use(tableName).info();
            return info.doc_count || 0;
        } catch (error) {
            logger.error(`Failed to retrieve document count for table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Adds indexes to a specific table.
     *
     * @param {string} tableName - The name of the table to add the index to.
     * @param {string | Array<string>} properties - The property to be indexed.
     * @returns {Promise<void>} - A promise that resolves when the index is successfully added.
     * @throws {Error} - Throws an error if the table doesn't exist or if adding the index fails.
     */
    async addIndex(tableName, properties) {
        if (!properties || (Array.isArray(properties) && properties.length === 0)) {
            logger.info(`No indexes provided for table: ${tableName}. Skipping index creation.`);
            return;
        }

        properties = Array.isArray(properties) ? properties : [properties];
        const index = `${properties.join("_")}_index`;
        try {
            if (!await this.dbExists(tableName))
                throw new Error(`Table "${tableName}" does not exist.`);

            await this.dbClient.use(tableName).createIndex({
                name: index,
                index: {
                    fields: [properties]
                },
                type: "json" // default
            });

            logger.info(`Added index ${index} for table "${tableName}".`);
        } catch (err) {
            logger.error(`Could not add index ${index} on ${tableName}.`);
            throw new Error(`Could not add index ${index} on ${tableName}: ${err.message}`);
        }
    }

    /**
     * Inserts a document into a specified database.
     * @param {string} dbName - The name of the database.
     * @param {string} _id - The primary key for the record.
     * @param {Object} document - The document to insert.
     * @returns {Promise<{ [key: string]: any }>} - The inserted document.
     * @throws {Error} - Throws an error if any operation fails, including checking if the record exists or inserting the record.
     */
    async insertDocument(dbName, _id, document) {
        try {
            const db = await this.openDatabase(dbName);
            const record = await this.readDocument(dbName, _id).catch(() => undefined);
            if (record)
                throw new Error(`A record with PK "${_id}" already exists in ${dbName}`);

            const insert = {
                ...pruneOpenDSUFields(document),
                [DBKeys.PK]: _id,
                [DBKeys.TIMESTAMP]: Date.now()
            };

            const {id} = await db.insert(insert);
            return this.readDocument(dbName, id);
        } catch (err) {
            logger.error(err);
            throw err;
        }
    }

    /**
     * Retrieves a document by its ID from a specified database.
     * @param {string} dbName - The name of the database.
     * @param {string} id - The ID of the document to retrieve.
     * @returns {Promise<{ pk: string, [key: string]: any }>} - The retrieved document.
     */
    async readDocument(dbName, id) {
        try {
            const document = await this.dbClient.use(dbName).get(id);
            return remapObject(document);
        } catch (error) {
            logger.error(`Error retrieving document ${id} from database ${dbName}:`, error);
            throw error;
        }
    }

    /**
     * Updates a record in the specified table.
     * If the record does not exist and the `fallbackInsert` flag is set, it will insert the record instead.
     *
     * @param {string} tableName - The name of the table to update the record in.
     * @param {string} id - The ID of the document to update.
     * @param {Object} document - The record data to update.
     * @returns {Promise<{ [key: string]: any }>} - The updated or inserted record.
     * @throws {Error} - If the operation fails.
     */
    async updateDocument(tableName, id, document) {
        try {
            const db = this.dbClient.use(tableName);
            const dbRecord = await db.get(id);
            if (!dbRecord && document[OpenDSUKeys.FALLBACK_INSERT]) {
                delete document[OpenDSUKeys.FALLBACK_INSERT]; // Remove the fallback flag
                return this.insertDocument(tableName, id, document);
            }

            const _rev = dbRecord[DBKeys.REV];
            for (let prop in document) {
                dbRecord[prop] = document[prop];
            }

            const update = {
                ...pruneOpenDSUFields(dbRecord),
                [DBKeys.PK]: id,
                [DBKeys.REV]: _rev,
                [DBKeys.TIMESTAMP]: Date.now()
            };

            const response = await db.insert(update);
            return await this.readDocument(tableName, response.id);
        } catch (error) {
            logger.error(`Error updating document ${id} in database ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Deletes a record from the specified table.
     * @param {string} tableName - The name of the table (database) to delete the record from.
     * @param {string} id - The primary key (ID) of the record to delete.
     * @returns {Promise<{ pk: string, [key: string]: any }>} - The deleted record.
     * @throws {Error} - If the operation fails.
     */
    async deleteDocument(tableName, id) {
        try {
            const document = await this.readDocument(tableName, id);
            await this.dbClient.use(tableName).destroy(id, document[DBKeys.REV]);
            return document;
        } catch (error) {
            if (error.statusCode === 404)
                return {pk: id};

            logger.error(`Error deleting document ${id} from table ${tableName}:`, error);
            throw error;
        }
    }

    /**
     * Lists documents from a specified database.
     *
     * @param {string} tableName - The name of the database to fetch documents from.
     * @param {Object} [options={}] - Optional configuration object for listing documents.
     * @param {number} [options.limit] - The maximum number of documents to fetch (optional).
     * @returns {Promise<Array<{ [key: string]: any }>>} - A promise that resolves to an array of document objects.
     * @throws {Error} - Throws an error if the database query fails.
     */
    async listDocuments(tableName, options = {}) {
        const {limit} = options;
        try {
            const queryOptions = {include_docs: true};
            if (limit && Number.isInteger(limit) && limit > 0)
                queryOptions.limit = limit;

            const response = await this.dbClient.use(tableName).list(queryOptions);
            return response.rows.map(row => row.doc) || [];
        } catch (error) {
            logger.error(`Error listing documents from table ${tableName}:`, error);
            throw error;
        }
    }


    async filter(tableName, query, sort = [], limit = undefined, skip = 0) {
        limit = normalizeNumber(limit, 1, undefined);
        skip = normalizeNumber(skip, 0, 0);
        sort = validateSort(sort);

        const selector = buildSelector(query);
        const mangoQuery = {
            selector,
            fields: ["*"],
            sort,
            skip,
            ...(limit ? {limit} : {})
        };

        try {
            const result = await this.dbClient.use(tableName).find(mangoQuery);
            return result.docs;
        } catch (error) {
            logger.error(`Error filtering documents from table ${tableName}:`, error);
            throw error;
        }
    }

}

module.exports = {DBService};

