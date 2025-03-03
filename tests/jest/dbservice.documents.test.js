require("../../../../builds/output/testsRuntime");
const {DBService} = require("../../services/DBService");
const {DBKeys, OpenDSUKeys} = require("../../utils/constants");

jest.setTimeout(30000);

describe("DBService Documents", () => {
    const genPK = () => `ID_${Date.now()}${Math.random().toString().slice(2)}`;
    const config = {uri: "http://localhost:5984", username: "admin", secret: "password"};
    const dbService = new DBService(config);
    const DBNAME = `test_db_docs_${Date.now()}`;
    const DOCUMENT = {
        model: "Ferrazzi",
        licensePlate: "FR-2189-TX",
        year: new Date().getFullYear(),
        available: true,
        rentalPrice: 150.90,
        owner: {name: "Speed Rent LTDA"}
    };

    beforeEach(async () => {
        await dbService.createDatabase(DBNAME, []);
    });

    afterEach(async () => {
        await dbService.deleteDatabase(DBNAME).catch(() => undefined);
    });

    it("should insert and retrieve a document", async () => {
        const pk = genPK();
        const insertedDoc = await dbService.insertDocument(DBNAME, pk, DOCUMENT);
        expect(insertedDoc).toMatchObject({
            ...DOCUMENT,
            [OpenDSUKeys.PK]: pk,
            [OpenDSUKeys.TIMESTAMP]: expect.any(Number),
        });

        Object.values(DBKeys).forEach((prop) => expect(insertedDoc[prop]).toBeUndefined());
    });

    it("should not insert a duplicate document", async () => {
        const pk = genPK();
        await dbService.insertDocument(DBNAME, pk, DOCUMENT);
        await expect(dbService.insertDocument(DBNAME, pk, DOCUMENT))
            .rejects
            .toThrowError(new Error(`A record with PK "${pk}" already exists in ${DBNAME}`));
    });

    it("should read an existing document", async () => {
        const pk = genPK();
        await dbService.insertDocument(DBNAME, pk, DOCUMENT);
        const readDoc = await dbService.readDocument(DBNAME, pk);
        expect(readDoc).toMatchObject({
            ...DOCUMENT,
            [OpenDSUKeys.PK]: pk,
            [OpenDSUKeys.TIMESTAMP]: expect.any(Number),
        });

        Object.values(DBKeys).forEach((prop) => expect(readDoc[prop]).toBeUndefined());
    });

    it("should return an error when reading a non-existent document", async () => {
        const pk = "NON_EXISTENT_ID";
        await expect(dbService.readDocument(DBNAME, pk))
            .rejects
            .toThrowError(new Error(`Document with PK "${pk}" not found in database "${DBNAME}"`));
    });


    it("should update an existing document", async () => {
        const pk = genPK();
        await dbService.insertDocument(DBNAME, pk, DOCUMENT);
        const readBeforeUpdate = await dbService.readDocument(DBNAME, pk);

        const updatedDoc = {
            ...DOCUMENT,
            year: new Date().getFullYear() - 1,
            available: false,
            owner: {
                name: "Speed Rent SA",
                location: "Seattle, WA 98104"
            }
        };
        const updateResult = await dbService.updateDocument(DBNAME, pk, updatedDoc);
        expect(updateResult).toMatchObject({
            ...updatedDoc,
            [OpenDSUKeys.PK]: pk,
            [OpenDSUKeys.TIMESTAMP]: expect.any(Number),
        });
        Object.values(DBKeys).forEach((prop) => expect(updateResult[prop]).toBeUndefined());

        const readAfterUpdate = await dbService.readDocument(DBNAME, pk);
        expect(readAfterUpdate[OpenDSUKeys.TIMESTAMP]).toBeGreaterThan(readBeforeUpdate[OpenDSUKeys.TIMESTAMP]);
    });

    it("should keep the PK unchanged after document update", async () => {
        const pk = genPK();
        await dbService.insertDocument(DBNAME, pk, DOCUMENT);
        const readBeforeUpdate = await dbService.readDocument(DBNAME, pk);

        const pkUpdated = {
            ...DOCUMENT,
            available: false,
            [DBKeys.PK]: genPK(),
            [OpenDSUKeys.PK]: genPK(),
        };
        const updateResult = await dbService.updateDocument(DBNAME, pk, pkUpdated);
        expect(updateResult).toMatchObject({
            ...DOCUMENT,
            available: false,
            [OpenDSUKeys.PK]: pk,
            [OpenDSUKeys.TIMESTAMP]: expect.any(Number),
        });

        Object.values(DBKeys).forEach((prop) => expect(updateResult[prop]).toBeUndefined());
        const readAfterUpdate = await dbService.readDocument(DBNAME, pk);
        expect(readAfterUpdate[OpenDSUKeys.TIMESTAMP]).toBeGreaterThan(readBeforeUpdate[OpenDSUKeys.TIMESTAMP]);
        expect(readAfterUpdate).toMatchObject({
            ...DOCUMENT,
            available: false,
            [OpenDSUKeys.PK]: pk,
            [OpenDSUKeys.TIMESTAMP]: updateResult[OpenDSUKeys.TIMESTAMP]
        });
    });


    it("should update an existing document and add a new property", async () => {
        const pk = genPK();
        await dbService.insertDocument(DBNAME, pk, DOCUMENT);

        const readBeforeUpdate = await dbService.readDocument(DBNAME, pk);
        const newPropertyDoc = {
            ...DOCUMENT,
            year: new Date().getFullYear(),
            available: false,
            returnStation: "SEA, Space Needle Rental"
        };

        const updateResult = await dbService.updateDocument(DBNAME, pk, newPropertyDoc);
        expect(updateResult).toMatchObject({
            ...newPropertyDoc,
            [OpenDSUKeys.PK]: pk,
            [OpenDSUKeys.TIMESTAMP]: expect.any(Number),
        });

        Object.values(DBKeys).forEach((prop) => expect(updateResult[prop]).toBeUndefined());

        const readAfterUpdate = await dbService.readDocument(DBNAME, pk);
        expect(readAfterUpdate.returnStation).toBe("SEA, Space Needle Rental");
        expect(readAfterUpdate[OpenDSUKeys.TIMESTAMP]).toBeGreaterThan(readBeforeUpdate[OpenDSUKeys.TIMESTAMP]);
    });

    it("should insert a document when updating a non-existent document with insert fallback", async () => {
        const pk = genPK();
        const readDoc = await dbService.readDocument(DBNAME, pk).catch(() => undefined);
        expect(readDoc).toBeUndefined();

        const insertedDoc = await dbService.updateDocument(DBNAME, pk, {
            ...DOCUMENT,
            available: false,
            [OpenDSUKeys.FALLBACK_INSERT]: true
        });
        expect(insertedDoc[OpenDSUKeys.FALLBACK_INSERT]).toBeUndefined();
        expect(insertedDoc).toMatchObject({
            ...DOCUMENT,
            available: false,
            [OpenDSUKeys.PK]: pk,
            [OpenDSUKeys.TIMESTAMP]: expect.any(Number)
        });

        Object.values(DBKeys).forEach((prop) => expect(insertedDoc[prop]).toBeUndefined());

        const readAfterInsert = await dbService.readDocument(DBNAME, pk);
        expect(readAfterInsert).toMatchObject({
            ...DOCUMENT,
            available: false,
            [OpenDSUKeys.PK]: pk,
            [OpenDSUKeys.TIMESTAMP]: insertedDoc[OpenDSUKeys.TIMESTAMP]
        });

        Object.values(DBKeys).forEach((prop) => expect(readAfterInsert[prop]).toBeUndefined());
    });

    it("should throw an error when trying to update a non-existent document with fallback set to false", async () => {
        const pk = genPK();
        const readDoc = await dbService.readDocument(DBNAME, pk).catch(() => undefined);
        expect(readDoc).toBeUndefined();

        try {
            await dbService.updateDocument(DBNAME, pk, {
                ...DOCUMENT,
                [OpenDSUKeys.FALLBACK_INSERT]: false
            });
            throw new Error("Expected error due to fallback being false, but none was thrown.");
        } catch (error) {
            expect(error.message).toBe(`Failed to update document "${pk}" from "${DBNAME}": Not found.`);
        }
    });

    it("should list all documents in the database", async () => {
        const [pk1, pk2] = [genPK(), genPK()];
        await dbService.insertDocument(DBNAME, pk1, DOCUMENT);
        await dbService.insertDocument(DBNAME, pk2, DOCUMENT);

        const documents = await dbService.listDocuments(DBNAME);

        expect(Array.isArray(documents)).toBe(true);
        expect(documents.length).toEqual(2);
        expect(documents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    ...DOCUMENT,
                    [OpenDSUKeys.PK]: pk1,
                    [OpenDSUKeys.TIMESTAMP]: expect.any(Number)
                }),
                expect.objectContaining({
                    ...DOCUMENT,
                    [OpenDSUKeys.PK]: pk2,
                    [OpenDSUKeys.TIMESTAMP]: expect.any(Number),
                })
            ])
        );
    });

    it("should list documents with a limit", async () => {
        const pk = genPK();
        await dbService.insertDocument(DBNAME, pk, DOCUMENT);
        const documents = await dbService.listDocuments(DBNAME, {limit: 1});
        expect(documents.length).toBeLessThanOrEqual(1);
        expect(documents[0][OpenDSUKeys.PK]).toEqual(pk);
    });

    it("should delete a document", async () => {
        const pk = genPK();
        const readDoc = await dbService.readDocument(DBNAME, pk).catch(() => undefined);
        expect(readDoc).toBeUndefined();

        await dbService.insertDocument(DBNAME, pk, DOCUMENT);
        const response = await dbService.deleteDocument(DBNAME, pk);
        expect(response).toMatchObject({[OpenDSUKeys.PK]: pk});

        await dbService.readDocument(DBNAME, pk);
        await expect(dbService.readDocument(DBNAME, pk))
            .rejects
            .toThrowError(new Error(`Document with PK "${pk}" not found in database "${DBNAME}"`));
    });

    it("should return PK when deleting a non-existent document", async () => {
        const pk = "NON_EXISTENT_ID";
        const readDoc = await dbService.readDocument(DBNAME, pk).catch(() => undefined);
        expect(readDoc).toBeUndefined();

        const result = await dbService.deleteDocument(DBNAME, pk);
        expect(result).toEqual({pk: pk});
    });

    it("should filter documents using different operators", async () => {
        const documents = {
            C1: {...DOCUMENT, pk: genPK(), available: false, licensePlate: "TSLA-7519", model: "Telsa", rentalPrice: 50},
            C2: {...DOCUMENT, pk: genPK(), available: false, licensePlate: "FX-456-TX", model: "Ferrazzi", rentalPrice: 450},
            C3: {...DOCUMENT, pk: genPK(), licensePlate: "XQ-789-FX", model: "Ferrazzi", rentalPrice: 930},
            C4: {...DOCUMENT, pk: genPK(), licensePlate: "FX-447-QW", model: "Aodi", rentalPrice: 200},
            C5: {...DOCUMENT, pk: genPK(), licensePlate: "7890 A3XQ", model: "Aodi", rentalPrice: 400},
        };

        for (const doc of Object.values(documents)) {
            await dbService.insertDocument(DBNAME, doc.pk, doc);
        }

        // OR OPERATOR
        const orFilter = await dbService.filter(DBNAME, ["model == Ferrazzi || model == Telsa"]);
        expect(orFilter).toMatchObject([
            {...documents.C1, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C2, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C3, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)}
        ]);

        const orMultipleFilter = await dbService.filter(DBNAME, ["model != Ferrazzi || rentalPrice < 450 || rentalPrice >= 50"]);
        expect(orMultipleFilter).toMatchObject([
            {...documents.C1, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C4, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C5, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)}
        ]);


        // == OPERATOR
        const eqFilter = await dbService.filter(DBNAME, ["model == Ferrazzi"]);
        expect(eqFilter).toMatchObject([
            {...documents.C2, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C3, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)}
        ]);

        // != OPERATOR
        const neFilter = await dbService.filter(DBNAME, ["model != Ferrazzi", "rentalPrice >= 400"]);
        expect(neFilter).toEqual(expect.arrayContaining([
            {...documents.C5, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
        ]));

        // > OPERATOR
        const gtFilter = await dbService.filter(DBNAME, ["rentalPrice > 900"]);
        expect(gtFilter).toMatchObject([
            {...documents.C3, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
        ]);

        // >= OPERATOR
        const gteFilter = await dbService.filter(DBNAME, ["rentalPrice >= 450"]);
        expect(gteFilter).toMatchObject([
            {...documents.C2, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C3, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
        ]);

        // < OPERATOR
        const ltFilter = await dbService.filter(DBNAME, ["rentalPrice < 200"]);
        expect(ltFilter).toMatchObject([
            {...documents.C1, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
        ]);

        // <= OPERATOR
        const lteFilter = await dbService.filter(DBNAME, ["rentalPrice <= 200"]);
        expect(lteFilter).toMatchObject([
            {...documents.C1, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C4, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
        ]);

        // like / $regex OPERATOR
        const likeFilter = await dbService.filter(DBNAME, ["licensePlate like .*FX.*"]);
        expect(likeFilter).toMatchObject([
            {...documents.C2, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C3, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C4, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
        ]);

        // false VALUE
        const filterByFalse = await dbService.filter(DBNAME, ["available == false"]);
        expect(filterByFalse).toMatchObject([
            {...documents.C1, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C2, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)}
        ]);

        // true VALUE
        const filterByTrue = await dbService.filter(DBNAME, ["available == true"]);
        expect(filterByTrue).toMatchObject([
            {...documents.C3, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C4, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)},
            {...documents.C5, [OpenDSUKeys.TIMESTAMP]: expect.any(Number)}
        ]);
    });

});
