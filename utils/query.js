const {DBKeys, SortOrder, DBOperatorsMap} = require("./constants");

/**
 * Normalizes a numeric value, ensuring it is an integer greater than or equal to the specified minimum.
 * If the value is null or undefined, returns the provided default value.
 * If the value is a valid integer but less than the minimum, returns the minimum value.
 *
 * @param {number|string|null|undefined} value - The value to normalize. Can be a number or a numeric string.
 * @param {number} min - The minimum allowable value.
 * @param {number|null} defaultValue - The default value to return if `value` is null or undefined.
 * @returns {number|null|undefined} The normalized integer or the default value if applicable.
 * @throws {Error} If the provided value is not a valid integer.
 */
function normalizeNumber(value, min, defaultValue) {
    if (typeof min !== 'number')
        throw new TypeError("min must be a number.");

    if (defaultValue !== null && defaultValue !== undefined && typeof defaultValue !== 'number')
        throw new TypeError("defaultValue must be a number if provided.");

    if (value === null || value === undefined)
        return (defaultValue < min) ? min : defaultValue;

    const num = Number(value);
    if (!Number.isInteger(num))
        throw new Error(`The value must be an integer or null.`);

    return num < min ? min : num;
}


/**
 * Validates and normalizes a sorting object or array.
 *
 * @param {Object|Array|undefined|null} sort - Sorting criteria.
 * @returns {Array<Object>} - Normalized sorting array.
 * @throws {Error} - If the sort object contains invalid values.
 */
function validateSort(sort) {
    // if null, undefined or {}
    if (!sort || (typeof sort === "object" && Object.keys(sort).length === 0))
        return [{[DBKeys.TIMESTAMP]: SortOrder.ASC}];

    if (typeof sort !== "object")
        throw new Error("Invalid sort format. Must be an object of key-value.");

    return Object.entries(sort).map(([key, value]) => {
        if (typeof value !== "string")
            throw new Error(`Invalid sort value "${value}" for key "${key}".`);

        const normalizedValue = value.toLowerCase();
        if (!Object.values(SortOrder).includes(normalizedValue))
            throw new Error(`Invalid sort order for key "${key}". Use one of ${Object.values(SortOrder)}.`);

        return {[key]: normalizedValue === SortOrder.DESC ? SortOrder.DSC : normalizedValue};
    })
}

/**
 * Validates if a query string uses only valid operators from DBOperatorsMap.
 * @param {string} query - The query string to validate (e.g., "field1 >= 100").
 * @returns {boolean} - Returns true if the query is valid, false otherwise.
 */
function validateQueryOperators(query) {
    const operatorRegex = Object.keys(DBOperatorsMap)
        .map(op => op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape characters
        .join("|");

    const regex = new RegExp(`^(\\w+)\\s*(${operatorRegex})\\s*(.*)$`, "i");
    return regex.test(query);
}


const isNumeric = (value) => !isNaN(value) && !isNaN(parseFloat(value));
const isBoolean = (value) => typeof value === "string" && (value.toLowerCase() === "true" || value.toLowerCase() === "false");

/**
 * Parses a given value to its appropriate type.
 * @param {string} value - The value to be parsed.
 * @returns {number|string|boolean} - Parsed value
 */
function parseValue(value) {
    value = typeof value === "string" ? value.trim() : value;
    if (isNumeric(value))
        return parseFloat(`${value}`)
    if (isBoolean(value))
        return `${value}`.toLowerCase() === "true";
    return value;
}


/**
 * Builds a condition object for a field, operator, and value.
 * @param {string} field - The field name.
 * @param {string} operator - The operator (e.g., ">=", "==", "like").
 * @param {string} value - The value to compare.
 * @returns {Object} - A condition object in the format { field: { operator: value } }.
 * @throws {Error} - Throws an error if the operator is invalid or the value is invalid for regex.
 */
function buildCondition(field, operator, value) {
    const mangoOperator = DBOperatorsMap[operator.toLowerCase().trim()];
    if (!mangoOperator)
        throw new Error(`Invalid operator: ${operator}`);

    if (mangoOperator === DBOperatorsMap.like) {
        try {
            new RegExp(value.trim(), "i"); // Validate if the value is a valid regex
        } catch (error) {
            throw new Error(`Invalid regex value: ${value}`);
        }
    }

    return {
        [field]: {
            [mangoOperator]: parseValue(value)
        }
    };
}

/**
 * Parses a query part (e.g., "field >= 100") into a condition object.
 * @param {string} queryPart - The query part (e.g., "field >= 100" || field2 <= 100").
 * @returns {Object} - A condition object (can be $or or a simple condition).
 * @throws {Error} - Throws an error if the query part is malformed.
 */
function parseQueryPart(queryPart) {
    if (queryPart.includes("||")) {
        // If it contains "||", treat it as an OR condition
        const orConditions = queryPart
            .split("||")
            .map(part => {
                part = part.trim();
                const [field, operator, value] = part.split(/\s+/);
                if (!field || !operator || !value)
                    throw new Error(`Malformed query part: ${part}`);
                return buildCondition(field, operator, value);
            });
        return {$or: orConditions};
    } else {
        // Otherwise, treat it as a simple AND condition
        const [field, operator, value] = queryPart.split(/\s+/);
        if (!field || !operator || !value) {
            throw new Error(`Malformed query part: ${queryPart}`);
        }
        return buildCondition(field, operator, value);
    }
}

/**
 * Converts an array of query strings into a selector object.
 * @param {string[]} query - Array of strings in the format "field operator value" or "field1 operator value1 || field2 operator value2".
 * @returns {Object} - A selector object in the format { $and: [...] } or an empty object if the array is empty.
 * @throws {Error} - Throws an error if the input is not a valid array.
 */
function buildSelector(query) {
    // if (typeof query === "object" && query !== null && Object.keys(query).length === 0)
    //     return {timestamp: {$gt: null}}; // TODO

    // if (!Array.isArray(query) || !query.every(item => typeof item === "string" && validateQueryOperators(item)))
    //     throw new Error("Query must be an array of valid condition strings");

    // if (query.length === 0)
    //     return {};

    // const conditions = query.map(parseQueryPart);
    // return {$and: conditions};

    return {
        timestamp: {
            $gt: 0
        }
    }
}


module.exports = {normalizeNumber, validateSort, parseValue, buildSelector};
