const {
    Tables,
    Permissions,
    parseConditionsToDBQuery,
    getSortingKeyFromCondition,
    safeParseKeySSI,
    generateUniqueId
} = require("../utils");
const {DBService} = require("../services");

/**
 * @param {string} msg - The custom error message.
 * @param {Error} [error] - Optional. The original error, if available.
 * @returns {Error | string} - The original error if provided, otherwise the custom message.
 */
function createOpenDSUErrorWrapper(msg, error) {
    return error || msg;
}

function LightDBAdapter(config) {
    const logger = $$.getLogger("LightDBAdapter", "LightDBAdapter");
    const openDSU = require("opendsu");
    const aclAPI = require("acl-magic");
    const keySSISpace = openDSU.loadAPI("keyssi");
    const w3cDID = openDSU.loadAPI("w3cdid");
    const utils = openDSU.loadAPI("utils");
    const CryptoSkills = w3cDID.CryptographicSkills;
    const baseConfig = config;

    const EnclaveMixin = openDSU.loadAPI("enclave").EnclaveMixin;
    EnclaveMixin(this);

    logger.info(`Initializing CouchDB instance.`);
    if (typeof config.uri === "undefined")
        throw Error("URI was not specified for LightDBAdapter");

    const dbService = new DBService(config);
    const persistence = aclAPI.createEnclavePersistence(this);
    utils.bindAutoPendingFunctions(this);

    //TODO: Base imp need real logic
    function parseConditionsToDBQuery(conditions) {
        if (!conditions || conditions.length === 0 || conditions === "") {
            return {};
        }

        return {};
    }

    /**
     * Creates a collection and sets indexes for it.
     *
     * @param {string} forDID
     * @param {string} dbName - The name of the database to create.
     * @param {array<string>} indexes - An array of index objects to be created in the database.
     * @param {function(Error|null, string)} callback - A callback function that returns an error (if any) and the result message.
     */
    this.createCollection = function (forDID, dbName, indexes, callback) {
        if (!callback) {
            callback = indexes;
            indexes = [];
            dbName = forDID;
            forDID = undefined;
        }
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        if (dbService.dbExists(dbName))
            return callback(undefined, {message: `Collection ${dbName} Already Exists!`})

        dbService.createDatabase(tdbName, indexes)
            .then((response) => callback(undefined, {message: `Collection ${dbName} created`}))
            .catch((e) => callback(e, undefined));
    }

    /**
     * Removes a collection.
     *
     * @param {string} did
     * @param {string} dbName - The name of the database to create.
     * @param {function(Error|null, {message: string})} callback - A callback function that returns an error (if any) and the result message.
     */
    this.removeCollection = (did, dbName, callback) => {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        if (!dbService.dbExists(dbName))
            return callback(undefined, {message: `Collection ${dbName} was removed!`})

        dbService.deleteDatabase(dbName).then((r) => {
            // maintained backward compatibility: The saveDatabase method was previously called
            callback(undefined, {message: `Collection ${dbName} was removed!`});
        }).catch((e) => callback(e));
    }

    this.removeCollectionAsync = (did, dbName) => {
        return new Promise((resolve, reject) => {
            this.removeCollection(did, dbName, (err, result) => err ? reject(err) : resolve(result));
        });
    }

    /**
     * Lists all collections and returns the document count for each.
     *
     * @returns {Promise<Array<{ name: string, type: string, count: number }>>} - Resolves to an array of objects containing the collection name, its type, and the document count.
     */
    this.listCollections = async () => {
        return dbService.listDatabases(true);
    }

    /**
     * Retrieves a list of collections
     *
     * @param {string} forDID
     * @param {function(Error|undefined, Array<string>)} callback
     */
    this.getCollections = (forDID, callback) => {
        if (!callback) {
            callback = forDID;
            forDID = undefined;
        }
        dbService.listDatabases(false)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(e, undefined));
    }


    /**
     * Adds an index to a specified table for a given property.
     *
     * @param {string} dbName - The name of the table where the index will be added.
     * @param {string} property - The property (field) on which the index will be created.
     * @param {function(Error|undefined, void)} callback
     */
    this.addIndex = function (dbName, property, callback) {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        dbService.addIndex(dbName, property)
            .then((r) => callback(undefined))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Could not add index ${property} on ${dbName}`, e), undefined));
    }


    /**
     * Counts the number of documents in a table.
     *
     * @param {string} dbName
     * @param {function(Error|undefined, number)} callback
     */
    this.count = function (dbName, callback) {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        dbService.countDocs(dbName)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(e, undefined));
    };


    /**
     * Inserts a record into the specified table.
     *
     * @param {string} forDID
     * @param {string} dbName - The table name where the record should be inserted.
     * @param {string} pk - The record id (primary key)
     * @param {Object} record - The record to insert into the database.
     * @param {function(Error|undefined, { [key: string]: any })} callback
     */
    this.insertRecord = (forDID, dbName, pk, record, callback) => {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        dbService.insertDocument(dbName, pk, record)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(e, undefined));
    };

    /**
     * Get a record from the specified table.
     *
     * @param {string} forDID
     * @param {string} dbName - The table name from which the record will be retrieved.
     * @param {string} pk - The record id (primary key)
     * @param {function(Error|undefined, { [key: string]: any })} callback
     */
    this.getRecord = function (forDID, dbName, pk, callback) {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        dbService.readDocument(dbName, pk)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Could not find object with pk ${pk}`, e), undefined));
    };

    /**
     * Updates an existing record in the specified table.
     *
     * @param {string} forDID
     * @param {string} dbName - The name of the table where the record will be updated.
     * @param {string} pk - The record id (primary key)
     * @param {Object} record - The data to update the record (can be a full or partial update).
     * @param {function(Error|undefined, { [key: string]: any })} callback
     */
    this.updateRecord = function (forDID, dbName, pk, record, callback) {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        dbService.updateDocument(dbName, pk, record)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(createOpenDSUErrorWrapper(` Could not insert record in table ${dbName} `, e)));
    };

    /**
     * Deletes an existing record in the specified table.
     *
     * @param {string} forDID
     * @param {string} dbName - The name of the table where the record will be deleted.
     * @param {string} pk - The record id (primary key) to be deleted
     * @param {function(Error|undefined, {pk: string, [key: string]: any})} callback
     */
    this.deleteRecord = function (forDID, dbName, pk, callback) {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        dbService.deleteDocument(dbName, pk)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Couldn't do remove for pk ${pk} in ${dbName}`, e)));
    };

    /**
     * Filters records in the specified table based on given conditions.
     *
     * @param {string} dbName - The name of the table to query.
     * @param {Object} filterConditions - The conditions to filter records by.
     * @param {"asc" | "dsc"} [sort] - Optional sorting criteria.
     * @param {number} [max] - Optional maximum number of records to return.
     * @param {function(Error|undefined, Array<{[key: string]: any }>)} callback
     */
    this.filter = function (dbName, filterConditions, sort, max, callback) {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        if (typeof filterConditions === "string") {
            filterConditions = [filterConditions];
        }

        if (typeof filterConditions === "function") {
            callback = filterConditions;
            filterConditions = undefined;
            sort = "asc";
            max = Infinity;
        }

        if (typeof sort === "function") {
            callback = sort;
            sort = "asc";
            max = Infinity;
        }

        if (typeof max === "function") {
            callback = max;
            max = Infinity;
        }

        if (!max) {
            max = Infinity;
        }

        const sortingField = getSortingKeyFromCondition(filterConditions);
        filterConditions = parseConditionsToDBQuery(filterConditions);

        const db = dbService.openDatabase(dbName);

        if (!db)
            return callback(undefined, []);

        let direction = false;
        if (sort === "desc" || sort === "dsc") {
            direction = true;
        }

        // let result;
        // try {
        //     result = db.find(filterConditions).simplesort(sortingField, direction).limit(max).data();
        // } catch (err) {
        //     return callback(createOpenDSUErrorWrapper(`Filter operation failed on ${dbName}`, err));
        // }

        // TODO: Add filter
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);
        dbService.filter(dbName, {})
            .then((response) => callback(undefined, response))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Filter operation failed on ${dbName}`, e)));
    }

    /**
     * Retrieves a single record from the specified table.
     *
     * @param {string} did - The table name from which the record will be retrieved.
     * @param {string} tableName - The table name from which the record will be retrieved.
     * @param {function(Error|undefined, {[key: string]: any})} callback
     */
    this.getOneRecord = (did, tableName, callback) => {
        tableName = dbService.changeDBNameToLowerCaseAndValidate(tableName);

        dbService.listDocuments(tableName, {limit: 1})
            .then((response) => callback(undefined, !response.length ? undefined : response))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Failed to fetch record from ${tableName}`, e)));
    }

    /**
     * Retrieves all records from the specified table.
     *
     * @param {string} dbName - The table name from which the records will be retrieved.
     * @param {function(Error|undefined, Array<{[key: string]: any}>)} callback
     */
    this.getAllRecords = (dbName, callback) => {
        dbName = dbService.changeDBNameToLowerCaseAndValidate(dbName);

        dbService.listDocuments(dbName)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Failed to fetch records from ${dbName}`, e)));
    }

    // --------------------------------------------------------------------
    // READ-WRITE TABLE METHODS
    // --------------------------------------------------------------------
    /**
     * @param {string} key - The key under which the value will be stored.
     * @param {*} value - The value to store.
     * @param {function(Error|undefined, {[key: string]: any})} callback
     * @returns {void}
     */
    this.writeKey = (key, value, callback) => {
        const valueObject = {type: typeof value, value};
        if (typeof value === "object") {
            valueObject.type = Buffer.isBuffer(value) ? "buffer" : "object";
            valueObject.value = Buffer.isBuffer(value) ? value.toString() : JSON.stringify(value)
        }
        this.insertRecord(Tables.READ_WRITE_KEY, key, valueObject, callback);
    }

    /**
     * @param {string} key - The record id
     * @param {function(Error|undefined, {[key: string]: any})} callback
     * @returns {void}
     */
    this.readKey = (key, callback) => {
        this.getRecord(Tables.READ_WRITE_KEY, key, (err, record) => {
            if (err)
                return callback(createOpenDSUErrorWrapper(`Failed to read key ${key}`, err));
            callback(undefined, record);
        });
    }

    // --------------------------------------------------------------------
    // ACCESS METHODS
    // --------------------------------------------------------------------
    this.grantWriteAccess = (forDID, callback) => {
        persistence.grant(Permissions.WRITE_ACCESS, Permissions.WILDCARD, forDID, (err) => {
            if (err) {
                return callback(err);
            }

            this.grantReadAccess(forDID, callback);
        });
    }

    this.hasWriteAccess = (forDID, callback) => {
        persistence.loadResourceDirectGrants(Permissions.WRITE_ACCESS, forDID, (err, usersWithAccess) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, usersWithAccess.indexOf(Permissions.WILDCARD) !== -1);
        });
    }

    this.revokeWriteAccess = (forDID, callback) => {
        persistence.ungrant(Permissions.WRITE_ACCESS, Permissions.WILDCARD, forDID, callback);
    }

    this.grantReadAccess = (forDID, callback) => {
        persistence.grant(Permissions.READ_ACCESS, Permissions.WILDCARD, forDID, callback);
    }

    this.hasReadAccess = (forDID, callback) => {
        persistence.loadResourceDirectGrants(Permissions.READ_ACCESS, forDID, (err, usersWithAccess) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, usersWithAccess.indexOf(Permissions.WILDCARD) !== -1);
        });
    }

    this.revokeReadAccess = (forDID, callback) => {
        persistence.ungrant(Permissions.READ_ACCESS, Permissions.WILDCARD, forDID, err => {
            if (err) {
                return callback(err);
            }

            this.revokeWriteAccess(forDID, callback);
        });
    }


    // --------------------------------------------------------------------
    // QUEUE METHODS
    // --------------------------------------------------------------------


    /**
     * Add an Object to Queue.
     *
     * @param {string} did
     * @param {string} queueName - The table name where the record should be inserted.
     * @param {*} encryptedObject - Object to be added to Queue
     * @param {boolean} ensureUniqueness - Whether to ensure uniqueness identifier
     * @param {function(Error|undefined, string)} callback
     * @returns {void}
     */
    this.addInQueue = (did, queueName, encryptedObject, ensureUniqueness, callback) => {
        if (typeof ensureUniqueness === "function") {
            callback = ensureUniqueness;
            ensureUniqueness = false;
        }
        const pk = generateUniqueId(encryptedObject, ensureUniqueness);
        // TODO - Add a specific table to QUEUE
        this.insertRecord(queueName, pk, encryptedObject, (err) => callback(err, pk));
    }


    /**
     *
     * @param {string} forDID
     * @param {string} queueName
     * @param {"asc" | "dsc"} sortAfterInsertTime
     * @param {number} onlyFirstN
     * @param {function(Error|undefined, Array<{[key: string]: any}>)} callback
     */
    this.listQueue = (forDID, queueName, sortAfterInsertTime, onlyFirstN, callback) => {
        if (typeof sortAfterInsertTime === "function") {
            callback = sortAfterInsertTime;
            sortAfterInsertTime = "asc";
            onlyFirstN = undefined
        }

        if (typeof onlyFirstN === "function") {
            callback = onlyFirstN;
            onlyFirstN = undefined;
        }

        this.filter(queueName, undefined, sortAfterInsertTime, onlyFirstN, (err, result) => {
            if (err) {
                if (err.code === 404)
                    return callback(undefined, []);
                return callback(err);
            }
            result = result.map(item => item.pk);
            return callback(null, result);
        });
    }

    /**
     * Returns the Queue size.
     *
     * @param {string} did
     * @param {string} queueName
     * @param {function(Error|undefined, number)} callback
     * @returns {void}
     */
    this.queueSize = (did, queueName, callback) => this.count(queueName, callback);

    /**
     * Get an Object from the Queue.
     *
     * @param {string} forDID
     * @param {string} queueName
     * @param {string} hash - The object hash/identifier
     * @param {function(Error|undefined, { [key: string]: any })} callback
     * @returns {void}
     */
    this.getObjectFromQueue = (forDID, queueName, hash, callback) => this.getRecord(queueName, hash, callback);

    /**
     * Deletes an existing record in the Queue.
     *
     * @param {string} forDID
     * @param {string} queueName
     * @param {string} hash - Queue record id
     * @param {function(Error|undefined, {pk: string, [key: string]: any})} callback
     * @returns {void}
     */
    this.deleteObjectFromQueue = (forDID, queueName, hash, callback) => this.deleteRecord(queueName, hash, callback);


    // --------------------------------------------------------------------
    // KeySSIs METHODS
    // --------------------------------------------------------------------
    /**
     * Stores a Seed SSI and its derived Key SSIs in the database.
     * The function first stores the Seed SSI under a given alias, then recursively derives and stores all associated Key SSIs.
     *
     * @param {string} seedSSI - The Seed SSI to be stored. This is expected to be a valid Key SSI string.
     * @param {string} alias - The alias under which the Seed SSI will be stored in the database.
     * @param {function(Error | undefined, void): void} callback
     * @returns {void}
     * @throws {Error} If the `seedSSI` parameter is not a valid Key SSI string.
     * @throws {Error} If there is an error storing the keySSI
     */
    this.storeSeedSSI = (seedSSI, alias, callback) => {
        try {
            seedSSI = safeParseKeySSI(seedSSI);
        } catch (e) {
            return callback(e, undefined);
        }

        const keySSIIdentifier = seedSSI.getIdentifier();

        const registerDerivedKeySSIs = (derivedKeySSI) => {
            this.insertRecord(Tables.KEY_SSIS_TABLE, derivedKeySSI.getIdentifier(), {capableOfSigningKeySSI: keySSIIdentifier}, (err) => {
                if (err)
                    return callback(err);

                try {
                    derivedKeySSI = derivedKeySSI.derive();
                } catch (e) {
                    return callback();
                }

                registerDerivedKeySSIs(derivedKeySSI);
            });
        }

        this.insertRecord(Tables.SEED_SSIS_TABLE, alias, {seedSSI: keySSIIdentifier}, (err) => {
            if (err)
                return callback(err);
            return registerDerivedKeySSIs(seedSSI);
        })
    }

    /**
     * Signs a hash using the provided keySSI.
     *
     * @param {string | {getIdentifier: () => string}} keySSI - The keySSI to be used for signing, can be a string or a keySSI object.
     * @param {string} hash - The hash value to be signed.
     * @param {function(Error | undefined, string): void} callback
     * @returns {void}
     * @throws {Error} If the keySSI is invalid or cannot be parsed.
     * @throws {Error} If an invalid keySSI is provided or if signing fails.
     */
    this.signForKeySSI = (keySSI, hash, callback) => {
        try {
            keySSI = safeParseKeySSI(keySSI);
        } catch (e) {
            return callback(e, undefined);
        }

        // TODO - Add specific method/class to query "protected" tables
        this.getRecord(Tables.KEY_SSIS_TABLE, keySSI.getIdentifier(), (err, record) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`No capable of signing keySSI found for keySSI ${keySSI.getIdentifier()}`, err));
            }

            let capableOfSigningKeySSI;
            try {
                capableOfSigningKeySSI = keySSISpace.parse(record.capableOfSigningKeySSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${record.capableOfSigningKeySSI}`, e))
            }

            if (typeof capableOfSigningKeySSI === "undefined")
                return callback(new Error(`The provided SSI does not grant writing rights`), undefined);

            capableOfSigningKeySSI.sign(hash, callback);
        });
    }

    // --------------------------------------------------------------------
    // DIDs METHODS
    // --------------------------------------------------------------------
    const getPrivateInfoForDID = (did, callback) => {
        this.getRecord(undefined, Tables.DIDS_PRIVATE_KEYS, did, (err, record) => {
            if (err) {
                return callback(err);
            }

            const privateKeysAsBuff = record.privateKeys.map(privateKey => {
                if (privateKey) {
                    return $$.Buffer.from(privateKey)
                }
                return privateKey;
            });
            callback(undefined, privateKeysAsBuff);
        });
    };

    const __ensureAreDIDDocumentsThenExecute = (did, fn, callback) => {
        if (typeof did === "string") {
            return w3cDID.resolveDID(did, (err, didDocument) => {
                if (err) {
                    return callback(err);
                }

                fn(didDocument, callback);
            })
        }

        fn(did, callback);
    }

    this.storeDID = (storedDID, privateKeys, callback) => {
        this.getRecord(Tables.DIDS_PRIVATE_KEYS, storedDID, (err, res) => {
            if (err || !res) {
                return this.insertRecord(Tables.DIDS_PRIVATE_KEYS, storedDID, {privateKeys: privateKeys}, callback);
            }

            privateKeys.forEach(privateKey => {
                res.privateKeys.push(privateKey);
            })
            this.updateRecord(Tables.DIDS_PRIVATE_KEYS, storedDID, res, callback);
        });
    }

    this.signForDID = (didThatIsSigning, hash, callback) => {
        const __signForDID = (didThatIsSigning, callback) => {
            getPrivateInfoForDID(didThatIsSigning.getIdentifier(), (err, privateKeys) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to get private info for did ${didThatIsSigning.getIdentifier()}`, err));
                }

                let signature;
                try {
                    signature = CryptoSkills.applySkill(didThatIsSigning.getMethodName(), CryptoSkills.NAMES.SIGN, hash, privateKeys[privateKeys.length - 1]);
                } catch (err) {
                    return callback(err);
                }
                callback(undefined, signature);
            });
        }

        __ensureAreDIDDocumentsThenExecute(didThatIsSigning, __signForDID, callback);
    }

    this.verifyForDID = (didThatIsVerifying, hash, signature, callback) => {
        const __verifyForDID = (didThatIsVerifying, callback) => {
            didThatIsVerifying.getPublicKey("pem", (err, publicKey) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to read public key for did ${didThatIsVerifying.getIdentifier()}`, err));
                }

                const verificationResult = CryptoSkills.applySkill(didThatIsVerifying.getMethodName(), CryptoSkills.NAMES.VERIFY, hash, publicKey, $$.Buffer.from(signature));
                callback(undefined, verificationResult);
            });
        }

        __ensureAreDIDDocumentsThenExecute(didThatIsVerifying, __verifyForDID, callback);
    }

    this.encryptMessage = (didFrom, didTo, message, callback) => {
        const __encryptMessage = () => {
            getPrivateInfoForDID(didFrom.getIdentifier(), (err, privateKeys) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to get private info for did ${didFrom.getIdentifier()}`, err));
                }

                CryptoSkills.applySkill(didFrom.getMethodName(), CryptoSkills.NAMES.ENCRYPT_MESSAGE, privateKeys, didFrom, didTo, message, callback);
            });
        }
        if (typeof didFrom === "string") {
            w3cDID.resolveDID(didFrom, (err, didDocument) => {
                if (err) {
                    return callback(err);
                }

                didFrom = didDocument;


                if (typeof didTo === "string") {
                    w3cDID.resolveDID(didTo, (err, didDocument) => {
                        if (err) {
                            return callback(err);
                        }

                        didTo = didDocument;
                        __encryptMessage();
                    })
                } else {
                    __encryptMessage();
                }
            })
        } else {
            __encryptMessage();
        }
    }

    this.decryptMessage = (didTo, encryptedMessage, callback) => {
        const __decryptMessage = (didTo, callback) => {
            getPrivateInfoForDID(didTo.getIdentifier(), (err, privateKeys) => {
                if (err) {
                    return callback(createOpenDSUErrorWrapper(`Failed to get private info for did ${didTo.getIdentifier()}`, err));
                }

                CryptoSkills.applySkill(didTo.getMethodName(), CryptoSkills.NAMES.DECRYPT_MESSAGE, privateKeys, didTo, encryptedMessage, callback);
            });
        }
        __ensureAreDIDDocumentsThenExecute(didTo, __decryptMessage, callback);
    };

    // --------------------------------------------------------------------
    // LokiDB Methods (DEPRECATED)
    // --------------------------------------------------------------------
    /**
     * @async
     * @returns {Promise<void>}
     * @deprecated This method is deprecated and will be removed in a future release. It does not perform any closing operations.
     */
    this.close = async () => {
        return new Promise((resolve, reject) => {
            logger.warn(`Deprecated method not implemented. LightDBAdapter.close called.`);
            resolve();
        });
    }

    /**
     * @param {function(): void} callback
     * @returns {void}
     * @deprecated This method is deprecated and will be removed in a future release. It does not perform any refresh operation.
     */
    this.refresh = (callback) => {
        logger.warn(`Deprecated method not implemented. LightDBAdapter.refresh called.`);
        callback();
    }

    /**
     * @returns {Promise<void>}
     * @deprecated This method is deprecated and will be removed in a future release. It does not perform any refresh operation.
     */
    this.refreshAsync = () => {
        return Promise.resolve();
    }

    /**
     * @returns {boolean}
     * @deprecated This method is deprecated and will be removed in a future release. It does not perform any refresh operation.
     */
    this.refreshInProgress = () => {
        return false;
    }

    /**
     * @param {string} forDID
     * @param {function(undefined, {message: string}): void} callback
     * @returns {void}
     * @deprecated This method is deprecated and will be removed in a future release. It does not perform any operation.
     */
    this.saveDatabase = (forDID, callback) => {
        if (!callback) {
            callback = forDID;
            forDID = undefined;
        }
        logger.warn(`Deprecated method. LightDBAdapter.saveDatabase called.`);
        callback(undefined, {message: `Database ${baseConfig.uri} saved`});
    }

    this.allowedInReadOnlyMode = function (functionName) {
        let readOnlyFunctions = [
            "getCollections",
            "listQueue",
            "queueSize",
            "count",
            "hasReadAccess",
            "getPrivateInfoForDID",
            "getCapableOfSigningKeySSI",
            "getPathKeyMapping",
            "getDID",
            "getPrivateKeyForSlot",
            "getIndexedFields",
            "getRecord",
            "getAllTableNames",
            "filter",
            "readKey",
            "getAllRecords",
            "getReadForKeySSI",
            "verifyForDID",
            "encryptMessage",
            "decryptMessage"];

        return readOnlyFunctions.indexOf(functionName) !== -1;
    }
}

LightDBAdapter.prototype.Adapters = {};
module.exports = LightDBAdapter;