require("../../../../builds/output/testsRuntime");
// const dc = require("double-check");
const {DBService} = require("../../services/DBService");
const {DBKeys} = require("../../utils/constants");

jest.setTimeout(30000);

describe("DBService Database", () => {
    const config = {uri: "http://localhost:5984", username: "admin", secret: "password"};
    const dbService = new DBService(config);
    const DBNAME = `test_db_${Date.now()}`;

    // beforeAll(async () => {
    //     dc.begin(() => {});
    // });

    afterEach(async () => {
        await dbService.deleteDatabase(DBNAME).catch(() => undefined);
        // dc.end();
    });

    it("should verify if database exists", async () => {
        await dbService.createDatabase(DBNAME, []);
        expect(await dbService.dbExists(DBNAME)).toBe(true);
        await dbService.deleteDatabase(DBNAME);
        expect(await dbService.dbExists(DBNAME)).toBe(false);
    });

    it("should create database and add indexes", async () => {
        expect(await dbService.dbExists(DBNAME)).toBe(false);
        const result = await dbService.createDatabase(DBNAME, [DBKeys.TIMESTAMP]);
        expect(result).toBe(true);
        expect(await dbService.dbExists(DBNAME)).toBe(true);
    });

    it("should open existing or create new database", async () => {
        expect(await dbService.dbExists(DBNAME)).toBe(false);
        await dbService.openDatabase(DBNAME);
        expect(await dbService.dbExists(DBNAME)).toBe(true);
    });

    it("should delete database", async () => {
        await dbService.openDatabase(DBNAME);
        expect(await dbService.dbExists(DBNAME)).toBe(true);

        const result = await dbService.deleteDatabase(DBNAME);
        expect(result).toBe(true);
        expect(await dbService.dbExists(DBNAME)).toBe(false);
    });

    it("should retrieve document count for a specific table", async () => {
        await dbService.createDatabase(DBNAME, []);
        const result = await dbService.countDocs(DBNAME);
        expect(result).toEqual(0);

        const pk = `ID_${Date.now()}`;
        await dbService.insertDocument(DBNAME, pk, {});
        await dbService.deleteDocument(DBNAME, pk);
        await dbService.insertDocument(DBNAME, `ID_${Date.now()}`, {});
        const count = await dbService.countDocs(DBNAME);
        expect(count).toEqual(1);
    });

    it("should return zero when retrieving document count for a non-existent table", async () => {
        try {
            const nonExistentTable = "nonExistentTable";
            await dbService.deleteDatabase(nonExistentTable).catch(() => undefined);
            const result = await dbService.countDocs(nonExistentTable);
            expect(result).toEqual(0);
        } catch (error) {
            expect(error || "Should not be throw").toBeUndefined();
        }
    });

    it("should list databases", async () => {
        const result = await dbService.listDatabases(false);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toEqual(0);

        await dbService.createDatabase(DBNAME, []);
        const dbList = await dbService.listDatabases(false);
        expect(Array.isArray(dbList)).toBe(true);
        expect(dbList.length).toEqual(1);
        expect(dbList[0]).toEqual(DBNAME);
    });

    it("should list databases with verbose enabled", async () => {
        expect(await dbService.listDatabases(true)).toMatchObject([]);

        await dbService.createDatabase(DBNAME, []);
        expect(await dbService.listDatabases(true)).toMatchObject([{name: DBNAME, type: "collection", count: 0}]);

        const pk = `ID_${Date.now()}`;
        await dbService.insertDocument(DBNAME, pk, {});
        await dbService.deleteDocument(DBNAME, pk);
        await dbService.insertDocument(DBNAME, `ID_${Date.now()}`, {});
        const dbVerboseList = await dbService.listDatabases(true);
        expect(dbVerboseList).toMatchObject([{name: DBNAME, type: "collection", count: 1}]);
        const count = await dbService.countDocs(DBNAME);
        expect(dbVerboseList[0].count).toEqual(count);
    });

    it("should skip adding index when no index is provided", async () => {
        const indexCreated = await dbService.addIndex(DBNAME, []);
        expect(indexCreated).toBe(false);
    });

    it("should add index to a specific table", async () => {
        await dbService.createDatabase(DBNAME, []);
        const indexCreated = await dbService.addIndex(DBNAME, [DBKeys.TIMESTAMP]);
        expect(indexCreated).toBe(true);
    });

    it("should handle error when trying to add index to a non-existent table", async () => {
        try {
            await dbService.addIndex("nonExistentTable", [DBKeys.TIMESTAMP]);
        } catch (error) {
            expect(error).toBeDefined();
            expect(error.message).toContain("Table \"nonExistentTable\" does not exist.");
        }
    });

});
