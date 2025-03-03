const DBKeys = {
    PK: "_id",
    TIMESTAMP: "timestamp",
    REV: "_rev",
    LOKI_ID: "$loki", // LokiDB unique ID
    META: "meta" // LokiDB property
};

const SortOrder = {
    ASC: "asc",
    DSC: "dsc",
    DESC: "desc" // LokiDB compatibility
};

const OpenDSUKeys = {
    PK: "pk",
    TIMESTAMP: "__timestamp",
    FALLBACK_INSERT: "__fallbackToInsert",
};

const Permissions = {
    WRITE_ACCESS: "write",
    READ_ACCESS: "read",
    WILDCARD: "*"
};

const Tables = {
    READ_WRITE_KEY: "KeyValueTable",
    KEY_SSIS_TABLE:"keyssis",
    SEED_SSIS_TABLE : "seedssis",
    DIDS_PRIVATE_KEYS : "dids_private"
};

const DBOperatorsMap = {
    "!=": "$ne",
    "==": "$eq",
    ">": "$gt",
    ">=": "$gte",
    "<": "$lt",
    "<=": "$lte",
    "like": "$regex",
    "||": "$or"
};

module.exports = {
    DBOperatorsMap,
    DBKeys,
    OpenDSUKeys,
    Permissions,
    Tables,
    SortOrder
};