/**
 * Processes a chunk of rows by applying the provided function to each row.
 * @param {Array} chunk - The chunk of rows to process.
 * @param {Function} processFunction - The function to apply to each row.
 * @returns {Promise<Array>} A promise that resolves with an array of processed results.
 */
async function processChunk(chunk, processFunction) {
    return Promise.all(chunk.map(row => processFunction(row))); // Apply the function to each chunk
}

/**
 * Processes the array in parallel using a specified number of workers.
 * @param {Array} rows - The array of records to process.
 * @param {number} workers - The number of workers.
 * @param {Function} processFunction - The function to apply to each element in array.
 * @returns {Promise<Array>} A promise that resolves with the combined processed results.
 */
async function processInChunks(rows, workers, processFunction) {
    if (!Array.isArray(rows) || (Array.isArray(rows) && rows.length === 0))
        return [];

    const chunkSize = Math.ceil(rows.length / workers); // Divide into chunks
    const promises = [];

    for (let i = 0; i < workers; i++) {
        const chunk = rows.slice(i * chunkSize, (i + 1) * chunkSize);
        const promise = processChunk(chunk, processFunction); // Process each "chunk"
        promises.push(promise);
    }

    return (await Promise.all(promises)).flat(); // Flat to merge arrays into one
}

module.exports = {processInChunks};
