const LightDBServer = require("./LightDBServer");
const LokiEnclaveFacade = require("./LokiEnclaveFacade");
const LightDBAdapter = require("./adapters/LightDBAdapter");
const {DBService} = require("./services/DBService");

const createLokiEnclaveFacadeInstance = (storage, autoSaveInterval, adaptorConstructorFunction) => {
    return new LokiEnclaveFacade(storage, autoSaveInterval, adaptorConstructorFunction);
}

const createLightDBServerInstance = (config, callback) => {
    return new LightDBServer(config, callback);
}

module.exports = {
    DBService,
    LightDBAdapter,
    createLokiEnclaveFacadeInstance,
    createLightDBServerInstance,
    Adapters: require("./adapters")
}
