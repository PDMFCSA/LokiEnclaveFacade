/**
 *
 * @param {{client: nano, config: config}} self
 * @param logger
 * @param {Function} method
 * @private
 */
function ensureAuth(self, logger, method){
    const name = method.name
    const original = self[name];
    self[name] = async function(...args){
        try {
            return await original.apply(this, args);
        } catch (e){
            if (e.statusCode === 401 || e['status-code'] === 401) {
                try {
                    console.debug(`Cookie expired - Re-authenticating with CouchDB server`);
                    await self.client.auth(self.config.username, self.config.secret);
                } catch (err){
                    throw new Error(`Failed to authenticate with CouchDB server to redo the ${name} operation. Error: ${err.message || err}. Original Error: ${e.message || e}`);
                }
                return await original.apply(self, args);
            }
            testErrorForShutdown(e, logger)
            throw e;
        }
    }.bind(self)
}


/**
 * Test is the error is worth shutting down the system for
 * @param {Error} error
 * @param logger
 * @returns {void}
 */
function testErrorForShutdown(error, logger){
    if (error.message.includes("ECONNREFUSED")){
        logger.error("Failed to connect to couchdb instance. Shutting down the system...");
        process.exit(1);
    }
}


module.exports =  {
    testErrorForShutdown,
    ensureAuth
}