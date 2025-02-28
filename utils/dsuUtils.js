/**
 * Parses the provided keySSI or throws an error if it's invalid or undefined.
 *
 * @param {{getIdentifier: () => string} | string | undefined} keySSI - The keySSI to be parsed.
 * @returns {{getIdentifier: () => string}} - Returns a promise that resolves with the parsed keySSI.
 * @throws {Error} - Throws an error if the keySSI is undefined or cannot be parsed.
 */
function safeParseKeySSI(keySSI) {
    if (typeof keySSI === "undefined")
        throw new Error(`A keySSI should be specified.`);

    if (typeof keySSI === "string") {
        try {
            return require("opendsu").loadAPI("keyssi").parse(keySSI);
        } catch (e) {
            throw new Error(`Failed to parse keySSI ${keySSI}: ${e.message || e}`);
        }
    }

    if (typeof keySSI === "object" && keySSI?.getIdentifier)
        return keySSI;

    throw new Error(`Invalid keySSI.`);
}


/**
 * Generates a unique ID based on an input object.
 *
 * @param {Object} inputObject - The input object to generate the hash from.
 * @param {boolean} [ensureUniqueness=false] - Whether to ensure uniqueness by appending a timestamp and random string.
 * @returns {string} - The generated unique ID.
 */
function generateUniqueId(inputObject, ensureUniqueness = false) {
    const crypto = openDSU.loadApi("crypto");
    const hash = crypto.sha256(inputObject);
    if (!ensureUniqueness)
        return hash;

    const randomString = crypto.encodeBase58(crypto.generateRandom(10));
    return `${hash}_${Date.now()}_${randomString}`;
}

module.exports = {
    safeParseKeySSI,
    generateUniqueId
}