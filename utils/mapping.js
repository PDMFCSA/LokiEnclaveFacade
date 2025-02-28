const {DBKeys, OpenDSUKeys, DBOperatorsMap} = require("./constants");

/**
 * Extracts the sorting field from the filter conditions.
 *
 * @param {string[]} filterConditions - An array of conditions in the format "field operator value".
 * @returns {string} - The field name used for sorting. Defaults to "__timestamp" if no conditions are provided.
 */
function getSortingKeyFromCondition(filterConditions) {
    if (!Array.isArray(filterConditions) || !filterConditions.length)
        return DBKeys.TIMESTAMP;

    const splitCondition = filterConditions[0].split(" ");
    return splitCondition[0].trim() || DBKeys.TIMESTAMP;
}

/**
 * Removes DSUFields from an object to avoid different properties with same value.
 * @param {Object} obj - The object from which fields will be removed.
 * @param {string[]} [fieldsToRemove] - List of keys to be removed from the object.
 * @returns {Object} - New object without the specified fields.
 */
function pruneOpenDSUFields(obj, fieldsToRemove = [
    OpenDSUKeys.PK, OpenDSUKeys.TIMESTAMP, DBKeys.REV,
    OpenDSUKeys.FALLBACK_INSERT, DBKeys.LOKI_ID, DBKeys.META
]) {
    return Object.keys(obj).reduce((acc, key) => {
        if (!fieldsToRemove.includes(key))
            acc[key] = obj[key];
        return acc;
    }, {});
}

/**
 * Remaps an object, removing unwanted keys and renaming keys based on a mapping.
 * @param {Object} obj - Original object
 * @param {string[] | undefined} fieldsToRemove - List of keys to be removed.
 * @returns {Object} - New object
 */
function remapObject(obj, fieldsToRemove = [
    DBKeys.PK, DBKeys.TIMESTAMP, DBKeys.REV,
    OpenDSUKeys.FALLBACK_INSERT, DBKeys.LOKI_ID, DBKeys.META
]) {
    // Key mapping: { original_key: new_key }
    const mapping = {
        [DBKeys.PK]: OpenDSUKeys.PK,
        [DBKeys.TIMESTAMP]: OpenDSUKeys.TIMESTAMP,
    };

    return Object.keys(obj).reduce((acc, key) => {
        // Check if the current key needs to be renamed
        const newKey = mapping[key] || key;
        if (!fieldsToRemove.includes(newKey))
            acc[newKey] = obj[key];
        return acc;
    }, {});
}


module.exports = {
    getSortingKeyFromCondition,
    pruneOpenDSUFields,
    remapObject
}