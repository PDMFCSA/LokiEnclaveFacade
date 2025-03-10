const {DBKeys} = require("../utils");
const logger = $$.getLogger("DBService");
const nano = require("nano");
const {ensureAuth} = require("./utils");
const {DatabaseClient} = require("./DBClient");

let dbService;

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
        if (dbService)
            return dbService;

        dbService = this;
        this.config = config;
        this.client = this.__createConnection(config);
        [
            this.dbExists,
            this.createDatabase,
            this.openDatabase,
            this.deleteDatabase,
            this.listDatabases,
            this.addIndex,
        ].forEach((m) => ensureAuth(this, logger, m));

        this.databases = {}
    }

    /**
     * Creates and returns a database client based on the provided configuration.
     * @param {{uri: string, username?: string, secret?: string}} config - Configuration object containing database connection details.
     * @returns {nano.ServerScope} - A database client instance.
     */
    __createConnection(config) {
        if (this.client)
            return this.client;

        const url = new URL(config.uri);
        if (url.username && url.password)
            logger.warn("Passing credentials in the URI is convenient but not secure. Consider pass them as parameters for cookie authentication for better security (https://guide.couchdb.org/editions/1/en/security.html#cookies).");

        const username = config.username || url.username || "";
        const password = config.secret || url.password || "";

        this.client = nano({
            url: config.uri,
            requestDefaults: {auth: {username, password}}
        });

        return this.client;
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
            const dbList = await this.client.db.list();
            return dbList.includes(dbName);
        } catch (error) {
            throw new Error(`Failed to check if database "${dbName}" exists: ${error.message || error}`);
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

            await this.client.db.create(dbName);
            logger.info(`Database "${dbName}" created successfully.`);

            const indexSet = new Set(Array.isArray(indexes) && indexes.length ? indexes : []);
            indexSet.add(DBKeys.TIMESTAMP)
            await this.addIndex(dbName, Array.from(indexSet));
            return true;
        } catch (err) {
            if (err.message.includes("the file already exists"))
                return true;
            throw new Error(`Fail creating database or adding indexes for ${dbName}: ${err.message || err}`);
        }
    }

    /**
     * Retrieves an existing database, or creates it if it does not exist.
     *
     * @param {string} dbName - Database name to retrieve or create.
     * @returns {Promise<DatabaseClient>} A Promise that resolves to database instance.
     * @throws {Error} Throws an error if the database retrieval or creation process fails.
     */
    async openDatabase(dbName) {
        const self = this;

        try {
            dbName = this.changeDBNameToLowerCaseAndValidate(dbName);

            function openAndCache(){
                if (!(dbName in self.databases)){
                    self.databases[dbName] = new DatabaseClient(self.client, dbName);
                }
                return self.databases[dbName];
            }

            if (await this.dbExists(dbName))
                return openAndCache()

            logger.info(`Database does not exist. Creating new database "${dbName}".`);
            await this.createDatabase(dbName);
            // TODO - Remove, return DBService instance
            return openAndCache()
        } catch (error) {
            throw new Error(`Error in openDatabase: ${error.message || error}`);
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
            await this.client.db.destroy(dbName);
            delete(this.databases[dbName]);
            return true;
        } catch (error) {
            if (error.status === 404) {
                logger.warn(`Database "${dbName}" does not exist. No deletion required.`);
                return true;
            }
            throw new Error(`Error deleting database ${dbName}: ${error}`);
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
            const list = await this.client.db.list();
            if (!verbose)
                return list;

            const databaseInfoList = [];
            for (const dbName of list) {
                const metadata = await self.client.use(dbName).info(); // Get metadata of the database
                databaseInfoList.push({
                    name: dbName,
                    type: "collection",
                    count: metadata.doc_count || 0
                });
            }
            return databaseInfoList;
        } catch (error) {
            throw new Error(`Error listing databases: ${error}`);
        }
    }

    /**
     * Retrieves the document count for a specific table
     *
     * @param {string} database - The table name to get the document count
     * @returns {Promise<number>} - A promise that resolves to the document count of the specified table.
     * @throws {Error} - Throws an error if retrieving the document count fails.
     */
    async countDocs(database) {
        const db = await this.openDatabase(database);
        return await db.countDocs()
    }

    /**
     * Adds indexes to a specific table.
     *
     * @param {string} database - The name of the table to add the index to.
     * @param {string | Array<string>} properties - The property or property list to be indexed.
     * @returns {Promise<boolean>} - Resolves to `true` if the index was successfully created.
     * @throws {Error} - Throws an error if the table doesn't exist or if adding the index fails.
     */
    async addIndex(database, properties) {
        if (!properties || (Array.isArray(properties) && properties.length === 0)) {
            logger.info(`No indexes provided for table: ${database}. Skipping index creation.`);
            return false;
        }

        if (!await this.dbExists(database))
            throw new Error(`Table "${database}" does not exist.`);

        properties = Array.isArray(properties) ? properties : [properties];
        const index = `${properties.join("_")}_index`;
        try {
            await this.client.use(database).createIndex({
                name: index,
                index: {
                    fields: properties
                },
                type: "json" // default
            });

            logger.info(`Added index ${index} for table "${database}".`);
            return true;
        } catch (err) {
            throw new Error(`Could not add index ${index} on ${database}: ${err.message}`);
        }
    }

    /**
     * Inserts a document into a specified table.
     * @param {string} database
     * @param {string} _id - The primary key for the record.
     * @param {Object} document - The document to insert.
     * @returns {Promise<{ [key: string]: any }>} - The inserted document.
     * @throws {Error} - Throws an error if any operation fails, including checking if the record exists or inserting the record.
     */
    async insertDocument(database, _id, document) {
        // TODO - Empty objects {} are not being validated.
        const db = await this.openDatabase(database);
        return await db.insertDocument(_id, document);
    }

    /**
     * Retrieves a document by its ID from the specified table.
     * @param {string} database
     * @param {string} _id - The ID of the document to retrieve.
     * @returns {Promise<{ pk: string, [key: string]: any }>} - The retrieved document.
     */
    async readDocument(database, _id) {
        const db = await this.openDatabase(database);
        return await db.readDocument(_id);
    }

    /**
     * Updates a record in the specified table.
     * If the record does not exist and the `fallbackInsert` flag is set to true, it will insert the record instead.
     *
     * @param {string} database
     * @param {string} _id - The ID of the document to update.
     * @param {Object} document - The record data to update.
     * @returns {Promise<{ [key: string]: any }>} - The updated or inserted record.
     * @throws {Error} - If the operation fails.
     */
    async updateDocument(database, _id, document) {
        const db = await this.openDatabase(database);
        return await db.updateDocument(_id,  document);
    }

    /**
     * Deletes a record from the specified table.
     * @param {string} database
     * @param {string} _id - The primary key (ID) of the record to delete.
     * @returns {Promise<{ pk: string }>} - The deleted record.
     * @throws {Error} - If the operation fails.
     */
    async deleteDocument(database, _id) {
        const db = await this.openDatabase(database);
        return await db.deleteDocument(_id)
    }

    /**
     * Lists documents from a specified table.
     *
     * @param {string} database - The name of the table to fetch documents from.
     * @param {Object} [options={}] - Optional configuration object for listing documents.
     * @param {number} [options.limit] - The maximum number of documents to fetch (optional).
     * @returns {Promise<Array<{ [key: string]: any }>>} - A promise that resolves to an array of document objects.
     * @throws {Error} - Throws an error if the query fails.
     */
    async listDocuments(database, options = {}) {
        const db = await this.openDatabase(database);
        return await db.listDocuments(options);
    }

    /**
     * Filters documents from specified table.
     *
     * @async
     * @param {string} database - The name of the table to query.
     * @param {Array<string>} query - The query object to filter documents.
     * @param {Array<Object>} [sort=[]] - Sorting criteria for the results.
     * @param {number} [limit=undefined] - Maximum number of documents to return.
     * @param {number} [skip=0] - Number of documents to skip before returning results.
     * @returns {Promise<Array<Object>>}g.
     * @throws {Error} If there is an issue querying the database.
     */
    async filter(database, query, sort = [], limit = undefined, skip = 0) {
        const db = await this.openDatabase(database);
        return await db.filter(query, sort, limit, skip);
    }

}

module.exports = {DBService};

