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
    if (value === null || value === undefined)
        return defaultValue;

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

function parseConditionsToDBQuery(conditions) {
    if (!conditions || conditions.length === 0 || conditions === "") {
        return {};
    }
    // Array to store the conditions that will go into the $and structure
    const andConditions = [];
    conditions.forEach(condition => {
        // Update regex pattern to capture more complex patterns for LIKE
        const match = condition.match(/^(\w+)\s*(>=|<=|==|!=|<>|>|<|like)\s*(.*)$/i);
        if (!match) {
            throw new Error(`Invalid condition: ${condition}`);
        }

        const [, field, operator, value] = match;
        const dbOperator = DBOperatorsMap[operator.toLowerCase()];

        let conditionObject = {};

        if (operator.toLowerCase() === "like") {
            // Process LIKE condition, and allow complex regex patterns
            conditionObject[field] = {[dbOperator]: new RegExp(value.trim(), 'i')}; // case-insensitive regex
        } else {
            // Process other operators, handling numeric and string cases
            const numericValue = parseFloat(value);
            conditionObject[field] = {
                [dbOperator]: isNaN(numericValue) ? value.replace(/['"]/g, '').trim() : numericValue
            };
        }

        andConditions.push(conditionObject);
    });

    return {$and: andConditions};
}

function buildSelector(query) {
    const selector = {};
    query.forEach(q => {
        const [field, operator, value] = q.split(/\s+/);
        const mangoOperator = DBOperatorsMap[operator];

        if (!mangoOperator)
            throw new Error(`Invalid operator: ${operator}`);

        if (mangoOperator === "$regex") {
            // selector[field] = { [mangoOperator]: `.*${value}.*` };
            selector[field] = { [mangoOperator]: new RegExp(value.trim(), 'i') };
        } else {
            selector[field] = { [mangoOperator]: value };
        }
    });

    return selector;
}

module.exports = {normalizeNumber, validateSort, buildSelector};
