const {DBService} = require("./services");
const {
    getSortingKeyFromCondition,
} = require("./utils");

function CouchDB(rootFolder, config) {
    const logger = $$.getLogger("CouchDB", "couchDB");
    const openDSU = require("opendsu");
    const aclAPI = require("acl-magic");
    const keySSISpace = openDSU.loadAPI("keyssi")
    const w3cDID = openDSU.loadAPI("w3cdid")
    const utils = openDSU.loadAPI("utils");
    const CryptoSkills = w3cDID.CryptographicSkills;
    const baseConfig = config;
    const split = rootFolder.split('/');
    const baseName = "a" + rootFolder.split('/')[split.length - 2];

    //compatibility
    try {
        const fs = require("fs");
        folderPath = rootFolder.replace(/\/database\/?$/, '')
        if(!fs.existsSync(folderPath));
            fs.mkdirSync(folderPath, { recursive: true });
    } catch(e) {
        logger.info(`Failed to create folder ${folderPath}. ${e}`);
    }
   
    const KEY_SSIS_TABLE = "keyssis";
    const SEED_SSIS_TABLE = "seedssis";
    const DIDS_PRIVATE_KEYS = "dids_private";

    logger.info(`Initializing CouchDB instance.`);
    if (typeof baseConfig.uri === "undefined")
        throw Error("URI was not specified for CouchDB");


    if (typeof baseName === "undefined") {
        throw Error("Root folder was not specified for CouchEnclaveFacade");
    }

    //USE BASE NAME TO CONCAT WITH TABLE NAME
    const db = new DBService(config);

    //TODO: Base imp need real logic
    function parseConditionsToDBQuery(conditions) {
        if (!conditions || conditions.length === 0 || conditions === "") {
            return {};
        }

        return {};
    }

    /**
     * Removes a collection.
     *
     * @param {string} collectionName - The name of the table to remove.
     * @param {function(Error|null, {message: string})} callback - A callback function that returns an error (if any) and the result message.
     */
    this.removeCollection = (collectionName, callback) => {
        collectionName = db.changeDBNameToLowerCaseAndValidate(baseName + collectionName);

        db.dbExists(collectionName).then((exists) => {
            if (!exists)
                return callback(undefined, {message: `Collection ${collectionName} was removed!`});

            db.deleteDatabase(collectionName).then( _ => {
                // maintained backward compatibility: The saveDatabase method was previously called
                callback(undefined, {message: `Collection ${collectionName} was removed!`});
            }).catch((e) => callback(e));
        }).catch((e) => callback(createOpenDSUErrorWrapper(`Could not create collection ${tableName}`, e), undefined))
    }

    /**
     * Lists all collections and returns the document count for each.
     *
     * @returns {Promise<Array<{ name: string, type: string, count: number }>>} - Resolves to an array of objects containing the collection name, its type, and the document count.
     */
    this.listCollections = () => {
        return db.listDatabases(true);
    }

    /**
     * Counts the number of documents in a table.
     *
     * @param {string} tableName
     * @param {function(Error|undefined, number)} callback
     */
    this.count = function (tableName, callback) {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.dbExists(tableName).then((exists) => {
            if (!exists)
                return callback(createOpenDSUErrorWrapper(`Table ${tableName} not found`));

            db.countDocs(tableName)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(e, undefined));
        }).catch((e) => callback(createOpenDSUErrorWrapper(`Could not create collection ${tableName}`, e), undefined))
    }

    /**
     * Retrieves a list of collections
     * @param {function(Error|undefined, Array<string>)} callback
     */
    this.getCollections = (callback) => {
        db.listDatabases(false)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(e, undefined));
    }

    /**
     * Creates a collection and sets indexes for it.
     *
     * @param {string} tableName - The name of the table to create.
     * @param {array<string>} indicesList - An array of index objects to be created in the database.
     * @param {function(Error|null, string)} callback - A callback function that returns an error (if any) and the result message.
     */
    this.createCollection = function (tableName, indicesList, callback) {
        if (typeof indicesList === "function") {
            callback = indicesList;
            indicesList = [];
        }

        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.dbExists(tableName).then((exists) => {
            if (exists)
                return callback(undefined, {message: `Collection ${tableName} Already Exists!`});
            db.createDatabase(tableName, indicesList)
                .then((response) => callback(undefined, {message: `Collection ${tableName} created`}))
                .catch((e) => callback(createOpenDSUErrorWrapper(`Could not create collection ${tableName}`, e), undefined));
        }).catch((e) => callback(createOpenDSUErrorWrapper(`Could not create collection ${tableName}`, e), undefined))
    }

    /**
     * Adds an index to a specified table for a given property.
     *
     * @param {string} tableName- The name of the table where the index will be added.
     * @param {string} property - The property (field) on which the index will be created.
     * @param {function(Error|undefined, void)} callback
     */
    this.addIndex = function (tableName, property, callback) {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.addIndex(tableName, property)
            .then((r) => callback(undefined))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Could not add index ${property} on ${tableName}`, e), undefined));
    }

    /**
     * Inserts a record into the specified table.
     *
     * @param {string} tableName - The table name where the record should be inserted.
     * @param {string} pk - The record id (primary key)
     * @param {Object} record - The record to insert into the database.
     * @param {function(Error|undefined, { [key: string]: any })} callback
     */
    this.insertRecord = (tableName, pk, record, callback) => {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.dbExists(tableName).then((exists) => {
            if (!exists)
                return callback(createOpenDSUErrorWrapper(`Could not insert record collection ${tableName} does not exist!`));

            db.insertDocument(tableName, pk, record)
                .then((response) => callback(undefined, response))
                .catch((e) => callback(createOpenDSUErrorWrapper(e), undefined));
        }).catch((e) => callback(createOpenDSUErrorWrapper(e), undefined))
    }

    /**
     * Updates an existing record in the specified table.
     *
     * @param {string} tableName - The name of the table where the record will be updated.
     * @param {string} pk - The record id (primary key)
     * @param {Object} record - The data to update the record (can be a full or partial update).
     * @param {function(Error|undefined, { [key: string]: any })} callback
     */
    this.updateRecord = function (tableName, pk, record, callback) {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.dbExists(tableName).then((exists) => {
            if (!exists)
                return callback(createOpenDSUErrorWrapper(`Could not update record collection ${tableName} does not exist!`));

            db.updateDocument(tableName, pk, record)(tableName, pk, record)
                .then((response) => callback(undefined, response))
                .catch((e) => callback(createOpenDSUErrorWrapper(e), undefined));
        }).catch((e) => callback(createOpenDSUErrorWrapper(e), undefined));
    }

    /**
     * Deletes an existing record in the specified table.
     *
     * @param {string} tableName - The name of the table where the record will be deleted.
     * @param {string} pk - The record id (primary key) to be deleted
     * @param {function(Error|undefined, {pk: string, [key: string]: any})} callback
     */
    this.deleteRecord = function (tableName, pk, callback) {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.dbExists(tableName).then((exists) => {
            if (!exists)
                return callback(createOpenDSUErrorWrapper(`Could not delete record collection ${tableName} does not exist!`));

            db.deleteDocument(tableName, pk)
                .then((response) => callback(undefined, response))
                .catch((e) => callback(createOpenDSUErrorWrapper(`Couldn't do remove for pk ${pk} in ${tableName}`, e)));
        }).catch((e) => callback(createOpenDSUErrorWrapper(e), undefined));
    }

    /**
     * Retrieves a single record from the specified table.
     *
     * @param {string} tableName - The table name from which the record will be retrieved.
     * @param {function(Error|undefined, {[key: string]: any})} callback
     */
    this.getOneRecord = function (tableName, callback) {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.dbExists(tableName).then((exists) => {
            if (!exists)
                return callback(undefined, []);

            db.listDocuments(tableName, {limit: 1})
            .then((response) => callback(undefined, !response.length ? [] : response))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Failed to fetch record from ${tableName}`, e)));
        }).catch((e) => callback(createOpenDSUErrorWrapper(e), undefined));
    }


    /**
     * Retrieves all records from the specified table.
     *
     * @param {string} tableName - The table name from which the records will be retrieved.
     * @param {function(Error|undefined, Array<{[key: string]: any}>)} callback
     */
    this.getAllRecords = (tableName, callback) => {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.dbExists(tableName).then((exists) => {
            if (!exists)
                return callback(undefined, []);

            db.listDocuments(tableName)
            .then((response) => callback(undefined, response))
            .catch((e) => callback(createOpenDSUErrorWrapper(`Failed to fetch records from ${tableName}`, e)));
        }).catch((e) => callback(createOpenDSUErrorWrapper(e), undefined));
    };

    /**
     * Get a record from the specified table.
     *
     * @param {string} tableName - The table name from which the record will be retrieved.
     * @param {string} pk - The record id (primary key)
     * @param {function(Error|undefined, { [key: string]: any })} callback
     */
    this.getRecord = function (tableName, pk, callback) {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

        db.dbExists(tableName).then((exists) => {
            if (!exists)
                return callback(createOpenDSUErrorWrapper(`Table ${tableName} not found`));

            db.readDocument(tableName, pk)
                .then((response) => callback(undefined, response))
                .catch((e) => callback(createOpenDSUErrorWrapper(`Could not find object with pk ${pk}`, e), undefined));
        }).catch((e) => callback(createOpenDSUErrorWrapper(e), undefined));
    }

    /**
     * Filters records in the specified table based on given conditions.
     *
     * @param {string} tableName - The name of the table to query.
     * @param {Object} filterConditions - The conditions to filter records by.
     * @param {"asc" | "dsc"} [sort] - Optional sorting criteria.
     * @param {number} [max] - Optional maximum number of records to return.
     * @param {function(Error|undefined, Array<{[key: string]: any }>)} callback
     */
    this.filter = function (tableName, filterConditions, sort, max, callback) {
        tableName = db.changeDBNameToLowerCaseAndValidate(baseName + tableName);

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

        db.openDatabase(tableName).then((db) => {
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
            //     return callback(createOpenDSUErrorWrapper(`Filter operation failed on ${tableName}`, err));
            // }

            // TODO: Add filter
            db.filter(tableName, {})
                .then((response) => callback(undefined, response))
                .catch((e) => callback(createOpenDSUErrorWrapper(`Filter operation failed on ${tableName}`, e)));
        }).catch((e) => callback(createOpenDSUErrorWrapper(`open operation failed on ${tableName}`, e)))
    }


    /**
     * --------------------------------------------------------------------
     * Access Methods
     * --------------------------------------------------------------------
     */
    const WRITE_ACCESS = "write";
    const READ_ACCESS = "read";
    const WILDCARD = "*";
    const persistence = aclAPI.createEnclavePersistence(this);

    this.grantWriteAccess = (callback) => {
        persistence.grant(WRITE_ACCESS, WILDCARD, (err) => {
            if (err) {
                return callback(err);
            }

            this.grantReadAccess(callback);
        });
    }

    this.hasWriteAccess = (callback) => {
        persistence.loadResourceDirectGrants(WRITE_ACCESS, (err, usersWithAccess) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, usersWithAccess.indexOf(WILDCARD) !== -1);
        });
    }

    this.revokeWriteAccess = (callback) => {
        persistence.ungrant(WRITE_ACCESS, WILDCARD, callback);
    }

    this.grantReadAccess = (callback) => {
        persistence.grant(READ_ACCESS, WILDCARD, callback);
    }

    this.hasReadAccess = (callback) => {
        persistence.loadResourceDirectGrants(READ_ACCESS, (err, usersWithAccess) => {
            if (err) {
                return callback(err);
            }

            callback(undefined, usersWithAccess.indexOf(WILDCARD) !== -1);
        });
    }

    this.revokeReadAccess = (callback) => {
        persistence.ungrant(READ_ACCESS, WILDCARD, err => {
            if (err) {
                return callback(err);
            }

            this.revokeWriteAccess(callback);
        });
    }

    /**
     * --------------------------------------------------------------------
     * Access Methods END
     * --------------------------------------------------------------------
     */

    /**
     * --------------------------------------------------------------------
     * LokiDB Methods (DEPRECATED)
     * --------------------------------------------------------------------
     */

    /**
     * @async
     * @returns {Promise<void>}
     * @deprecated This method is deprecated and will be removed in a future release. It does not perform any closing operations.
     */
    this.close = async () => {
        return new Promise((resolve, reject) => {
            logger.warn(`Deprecated method not implemented. CouchDB.close called.`);
            resolve();
        });
    }

    /**
     * @param {function(): void} callback
     * @returns {void}
     * @deprecated This method is deprecated and will be removed in a future release. It does not perform any refresh operation.
     */
    this.refresh = (callback) => {
        logger.warn(`Deprecated method not implemented. Couchdb.refresh called.`);
        callback();
    }

    /**
     * @param {function(undefined, {message: string}): void} callback
     * @returns {void}
     * @deprecated This method is deprecated and will be removed in a future release. It does not perform any operation.
     */
    this.saveDatabase = (callback) => {
        logger.warn(`Deprecated method. Couchdb.saveDatabase called.`);
        callback(undefined, {message: `Deprecated method. Couchdb.saveDatabase called.`});
    }

    /**
     * --------------------------------------------------------------------
     * LokiDB Methods (DEPRECATED) End
     * --------------------------------------------------------------------
     */

    /**
     * --------------------------------------------------------------------
     * Key-Value TABLE METHODS
     * --------------------------------------------------------------------
     */

    utils.bindAutoPendingFunctions(this);

    const READ_WRITE_KEY_TABLE = "KeyValueTable";

    /**
     * @param {string} key - The key under which the value will be stored.
     * @param {*} value - The value to store.
     * @param {function(Error|undefined, {[key: string]: any})} callback
     * @returns {void}
     */
    this.writeKey = (key, value, callback) => {
        let valueObject = {
            type: typeof value,
            value: value
        };

        if (typeof value === "object") {
            if (Buffer.isBuffer(value)) {
                valueObject = {
                    type: "buffer",
                    value: value.toString()
                }
            } else {
                valueObject = {
                    type: "object",
                    value: JSON.stringify(value)
                }
            }
        }
        this.insertRecord(READ_WRITE_KEY_TABLE, key, valueObject, callback);
    }

    /**
     * @param {string} key - The record id
     * @param {function(Error|undefined, {[key: string]: any})} callback
     * @returns {void}
     */
    this.readKey = (key, callback) => {
        this.getRecord(READ_WRITE_KEY_TABLE, key, (err, record) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`Failed to read key ${key}`, err));
            }

            callback(undefined, record);
        })
    }

    /**
     * --------------------------------------------------------------------
     * Key-Value TABLE METHODS END
     * --------------------------------------------------------------------
     */

    /**
     * --------------------------------------------------------------------
     * QUEUE METHODS
     * --------------------------------------------------------------------
     */

    let self = this;

    /**
     * Add an Object to Queue.
     *
     * @param {string} queueName - The table name where the record should be inserted.
     * @param {*} encryptedObject - Object to be added to Queue
     * @param {boolean} ensureUniqueness - Whether to ensure uniqueness identifier
     * @param {function(Error|undefined, string)} callback
     * @returns {void}
     */
    this.addInQueue = function (queueName, encryptedObject, ensureUniqueness, callback) {
        if (typeof ensureUniqueness === "function") {
            callback = ensureUniqueness;
            ensureUniqueness = false;
        }
        const crypto = require("opendsu").loadApi("crypto");
        const hash = crypto.sha256(encryptedObject);
        let pk = hash;
        if (ensureUniqueness) {
            pk = `${hash}_${Date.now()}_${crypto.encodeBase58(crypto.generateRandom(10))}`;
        }
        self.insertRecord(queueName, pk, encryptedObject, (err) => callback(err, pk));
    }

    /**
     * Returns the Queue size.
     *
     * @param {string} queueName
     * @param {function(Error|undefined, number)} callback
     * @returns {void}
     */
    this.queueSize = function (queueName, callback) {
        self.count(queueName, callback);
    }

    /**
     *
     * @param {string} queueName
     * @param {"asc" | "dsc"} sortAfterInsertTime
     * @param {number} onlyFirstN
     * @param {function(Error|undefined, Array<{[key: string]: any}>)} callback
     */
    this.listQueue = function (queueName, sortAfterInsertTime, onlyFirstN, callback) {
        if (typeof sortAfterInsertTime === "function") {
            callback = sortAfterInsertTime;
            sortAfterInsertTime = "asc";
            onlyFirstN = undefined
        }
        if (typeof onlyFirstN === "function") {
            callback = onlyFirstN;
            onlyFirstN = undefined;
        }

        self.filter(queueName, undefined, sortAfterInsertTime, onlyFirstN, (err, result) => {
            if (err) {
                if (err.code === 404) {
                    return callback(undefined, []);
                }

                return callback(err);
            }

            /*            result = result.filter(item => {
                            if(typeof item.$loki !== "undefined"){
                                return true;
                            }
                            logger.warn("A message was filtered out because wrong loki document structure");
                            return false;
                        });*/

            result = result.map(item => {
                return item.pk
            })
            return callback(null, result);
        })
    }

    /**
     * Get an Object from the Queue.
     *
     * @param {string} queueName
     * @param {string} hash - The object hash/identifier
     * @param {function(Error|undefined, { [key: string]: any })} callback
     * @returns {void}
     */
    this.getObjectFromQueue = function (queueName, hash, callback) {
        return self.getRecord(queueName, hash, callback)
    }

    /**
     * Deletes an existing record in the Queue.
     *
     * @param {string} queueName
     * @param {string} hash - Queue record id
     * @param {function(Error|undefined, {pk: string, [key: string]: any})} callback
     * @returns {void}
     */

    this.deleteObjectFromQueue = function (queueName, hash, callback) {
        return self.deleteRecord(queueName, hash, callback)
    }

    /**
     * --------------------------------------------------------------------
     * KEYSSI METHODS END
     * --------------------------------------------------------------------
     */

    const getCapableOfSigningKeySSI = (keySSI, callback) => {
        if (typeof keySSI === "undefined") {
            return callback(Error(`A SeedSSI should be specified.`));
        }

        if (typeof keySSI === "string") {
            try {
                keySSI = keySSISpace.parse(keySSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${keySSI}`, e))
            }
        }

        this.getRecord(KEY_SSIS_TABLE, keySSI.getIdentifier(), (err, record) => {
            if (err) {
                return callback(createOpenDSUErrorWrapper(`No capable of signing keySSI found for keySSI ${keySSI.getIdentifier()}`, err));
            }

            let capableOfSigningKeySSI;
            try {
                capableOfSigningKeySSI = keySSISpace.parse(record.capableOfSigningKeySSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${record.capableOfSigningKeySSI}`, e))
            }

            callback(undefined, capableOfSigningKeySSI);
        });
    };

    this.storeSeedSSI = (seedSSI, alias, callback) => {
        if (typeof seedSSI === "string") {
            try {
                seedSSI = keySSISpace.parse(seedSSI);
            } catch (e) {
                return callback(createOpenDSUErrorWrapper(`Failed to parse keySSI ${seedSSI}`, e))
            }
        }

        const keySSIIdentifier = seedSSI.getIdentifier();

        const registerDerivedKeySSIs = (derivedKeySSI) => {
            this.insertRecord(KEY_SSIS_TABLE, derivedKeySSI.getIdentifier(), {capableOfSigningKeySSI: keySSIIdentifier}, (err) => {
                if (err) {
                    return callback(err);
                }

                try {
                    derivedKeySSI = derivedKeySSI.derive();
                } catch (e) {
                    return callback();
                }

                registerDerivedKeySSIs(derivedKeySSI);
            });
        }

        this.insertRecord(SEED_SSIS_TABLE, alias, {seedSSI: keySSIIdentifier}, (err) => {
            if (err) {
                return callback(err);
            }

            return registerDerivedKeySSIs(seedSSI);
        })
    }

    this.signForKeySSI = (keySSI, hash, callback) => {
        getCapableOfSigningKeySSI(keySSI, (err, capableOfSigningKeySSI) => {
            if (err) {
                return callback(err);
            }
            if (typeof capableOfSigningKeySSI === "undefined") {
                return callback(Error(`The provided SSI does not grant writing rights`));
            }

            capableOfSigningKeySSI.sign(hash, callback);
        });
    }

    /**
     * --------------------------------------------------------------------
     * KEYSSI METHODS END
     * --------------------------------------------------------------------
     */

    /**
     * --------------------------------------------------------------------
     * DIDS METHODS
     * --------------------------------------------------------------------
     */
    const getPrivateInfoForDID = (did, callback) => {
        this.getRecord(undefined, DIDS_PRIVATE_KEYS, did, (err, record) => {
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
        this.getRecord(DIDS_PRIVATE_KEYS, storedDID, (err, res) => {
            if (err || !res) {
                return this.insertRecord(DIDS_PRIVATE_KEYS, storedDID, {privateKeys: privateKeys}, callback);
            }

            privateKeys.forEach(privateKey => {
                res.privateKeys.push(privateKey);
            })
            this.updateRecord(DIDS_PRIVATE_KEYS, storedDID, res, callback);
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
    /**
     * --------------------------------------------------------------------
     * DIDS METHODS END
     * --------------------------------------------------------------------
     */
}

CouchDB.prototype.Adapters = {};
module.exports = CouchDB;
