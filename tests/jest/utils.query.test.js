const {
    normalizeNumber,
    validateSort,
    buildSelector,
    parseValue,
    DBKeys,
    SortOrder,
    DBOperatorsMap
} = require("../../utils");

describe("normalizeNumber", () => {
    test("should return the default value when input is null or undefined", () => {
        expect(normalizeNumber(null, 10, 5)).toBe(10);
        expect(normalizeNumber(undefined, 10, 5)).toBe(10);
    });

    test("should return the input value if it is greater than or equal to the minimum", () => {
        expect(normalizeNumber(15, 10, 5)).toBe(15);
        expect(normalizeNumber("20", 10, 5)).toBe(20);
    });

    test("should return the minimum value if the input is less than the minimum", () => {
        expect(normalizeNumber(5, 10, 5)).toBe(10);
        expect(normalizeNumber("8", 10, 5)).toBe(10);
    });

    test("should throw an error if the value is not an integer", () => {
        expect(() => normalizeNumber("string", 10, 5)).toThrowError("The value must be an integer or null.");
    });
});

describe("validateSort", () => {
    test("should return default sort when null or empty object is passed", () => {
        expect(validateSort(null)).toEqual([{[DBKeys.TIMESTAMP]: SortOrder.ASC}]);
        expect(validateSort({})).toEqual([{[DBKeys.TIMESTAMP]: SortOrder.ASC}]);
    });

    test("should throw error when the sort format is invalid", () => {
        expect(() => validateSort("invalid")).toThrowError("Invalid sort format. Must be an object of key-value.");
    });

    test("should throw error when the sort value is invalid", () => {
        expect(() => validateSort({[DBKeys.TIMESTAMP]: "invalid"})).toThrowError(`Invalid sort order for key "${DBKeys.TIMESTAMP}". Use one of ${Object.values(SortOrder)}.`);
    });

    test("should return normalized sort order for valid input", () => {
        expect(validateSort({[DBKeys.TIMESTAMP]: SortOrder.DESC})).toEqual([{[DBKeys.TIMESTAMP]: SortOrder.DSC}]);
        expect(validateSort({[DBKeys.TIMESTAMP]: SortOrder.ASC})).toEqual([{[DBKeys.TIMESTAMP]: SortOrder.ASC}]);
    });
});

describe("buildSelector", () => {
    test("should throw error when query array contains invalid strings", () => {
        expect(() => buildSelector(["field1 == value1", "invalidCondition"])).toThrowError("Query must be an array of valid condition strings");
    });

    test("should return correct selector object for valid conditions", () => {
        const query = ["field1 == value1", "field2 >= 10"];
        const expected = {
            $and: [
                {field1: {$eq: "value1"}},
                {field2: {$gte: 10}}
            ]
        };
        expect(buildSelector(query)).toEqual(expected);
    });

    test("should handle OR conditions correctly", () => {
        const query = ["field1 == value1 || field2 != value2", "field3 == False || field4 != TRUE", "field5 >= 1"];
        const expected = {
            $and: [
                {
                    $or: [
                        {field1: {$eq: "value1"}},
                        {field2: {$ne: "value2"}}
                    ]
                },
                {
                    $or: [
                        {field3: {$eq: false}},
                        {field4: {$ne: true}}
                    ]
                },
                {field5: {$gte: 1}}
            ]
        };

        expect(buildSelector(query)).toEqual(expected);
    });
});

describe("parseValue", () => {
    test("should parse boolean strings correctly", () => {
        expect(parseValue("true")).toBe(true);
        expect(parseValue("false")).toBe(false);
        expect(parseValue("yes")).toBe("yes");
        expect(parseValue("no")).toBe("no");
    });

    test("should parse numeric strings and numbers correctly", () => {
        expect(parseValue("123")).toBe(123);
        expect(parseValue("3.14")).toBe(3.14);
        expect(parseValue(42)).toBe(42);
        expect(parseValue(3.14)).toBe(3.14);
        expect(parseValue("abc")).toBe("abc");
        expect(parseValue("12abc")).toBe("12abc");
    });
});
