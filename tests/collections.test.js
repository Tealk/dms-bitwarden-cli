#!/usr/bin/env node
// Organization collections on the item form; field names from a real
// `bw list org-collections` and the item template.
//
//   node tests/collections.test.js

const { createSuite, loadModule } = require("./harness")
const Model = loadModule()

const { check, done } = createSuite("collections")

// --- command ---
check("collections are listed per organization with a producer-side byte limit",
  Model.listOrgCollectionsCommand("o1").join(" ").includes("bw list org-collections --organizationid o1")
    && Model.listOrgCollectionsCommand("o1").join(" ").includes("head -c"),
  Model.listOrgCollectionsCommand("o1").join(" "))
check("the session is not on the command line",
  !Model.listOrgCollectionsCommand("o1").join(" ").includes("--session"), "expected no --session")

// --- parsing ---
const cols = Model.parseCollections(JSON.stringify([
  { object: "org-collection", id: "c2", organizationId: "o1", name: "Ops", externalId: null },
  { object: "org-collection", id: "c1", organizationId: "o1", name: "admin", externalId: null },
  { object: "org-collection", name: "no id at all" },
]))
check("collections sort case-insensitively", cols.map(c => c.name).join(",") === "admin,Ops", cols.map(c => c.name).join(","))
check("an entry without an id is dropped", cols.length === 2, JSON.stringify(cols))
check("organizationId is carried through", cols[0].organizationId === "o1", JSON.stringify(cols[0]))
check("malformed JSON yields an empty list",
  Model.parseCollections("{{").length === 0 && Model.parseCollections("").length === 0, "expected []")
check("nameById resolves a known id", Model.nameById(cols, "c2") === "Ops", Model.nameById(cols, "c2"))
check("nameById is empty for an unknown id", Model.nameById(cols, "zz") === "", "expected empty")

// --- naming an item's place ---
// Every collection the account sees, for the list row and the detail screen.
check("all collections are listed from the local sync with a byte limit",
  Model.listCollectionsCommand().join(" ").includes("bw list collections")
    && Model.listCollectionsCommand().join(" ").includes("head -c")
    && !Model.listCollectionsCommand().join(" ").includes("--session"),
  Model.listCollectionsCommand().join(" "))
const orgs = [{ id: "o1", name: "Family" }]
const all = Model.parseCollections(JSON.stringify([
  { id: "c1", organizationId: "o1", name: "Shared" },
  { id: "c2", organizationId: "o1", name: "admin" },
  { id: "c3", organizationId: "o1", name: "Kids" },
]))
check("item rows carry their collection ids",
  JSON.stringify(Model.parseItems(JSON.stringify([
    { id: "i1", type: 1, name: "n", organizationId: "o1", collectionIds: ["c1", "c2"], login: {} }
  ]))[0].collectionIds) === JSON.stringify(["c1", "c2"]), "expected both ids")
check("a personal item row has no collections and no place label",
  Model.orgPlaceLabel(Model.parseItems(JSON.stringify([{ id: "i2", type: 1, name: "n", login: {} }]))[0], orgs, all) === "",
  "expected empty")
check("collection names are sorted and unknown ids skipped",
  Model.collectionNames(all, ["c1", "zz", "c2"]).join(",") === "admin,Shared",
  Model.collectionNames(all, ["c1", "zz", "c2"]).join(","))
// A list delegate's modelData gives the array back as an array-like sequence.
check("collection ids given as an array-like sequence still resolve",
  Model.collectionNames(all, { length: 2, 0: "c1", 1: "c2" }).join(",") === "admin,Shared", "expected both names")
check("a string is not mistaken for a list of ids",
  Model.collectionNames(all, "c1").length === 0, "expected none")
const twoOrgs = orgs.concat([{ id: "o2", name: "Work" }])
check("one collection: organization / collection",
  Model.orgPlaceLabel({ organizationId: "o1", collectionIds: ["c1"] }, twoOrgs, all) === "Family / Shared",
  Model.orgPlaceLabel({ organizationId: "o1", collectionIds: ["c1"] }, twoOrgs, all))
check("several collections: the first by name, then how many more",
  Model.orgPlaceLabel({ organizationId: "o1", collectionIds: ["c1", "c3", "c2"] }, twoOrgs, all) === "Family / admin +2",
  Model.orgPlaceLabel({ organizationId: "o1", collectionIds: ["c1", "c3", "c2"] }, twoOrgs, all))
check("the account's only organization is not repeated on every row",
  Model.orgPlaceLabel({ organizationId: "o1", collectionIds: ["c1", "c3"] }, orgs, all) === "Kids +1",
  Model.orgPlaceLabel({ organizationId: "o1", collectionIds: ["c1", "c3"] }, orgs, all))
check("before the collections load, the organization alone",
  Model.orgPlaceLabel({ organizationId: "o1", collectionIds: ["c1"] }, orgs, []) === "Family", "expected Family")
check("before the organizations load, the collection alone",
  Model.orgPlaceLabel({ organizationId: "o1", collectionIds: ["c1"] }, [], all) === "Shared", "expected Shared")
check("an org-owned SSH key keeps its collections on the row and in the detail",
  JSON.stringify(Model.parseSshKeys([{ id: "k1", name: "deploy", organizationId: "o1", collectionIds: ["c3"] }])[0].collectionIds) === JSON.stringify(["c3"])
    && JSON.stringify(Model.itemDetailFromObject({ id: "k1", type: 5, organizationId: "o1", collectionIds: ["c3"] }).collectionIds) === JSON.stringify(["c3"]),
  "expected c3 on both")
// What openDetail() passes is a row read back from QML: its arrays are array-likes.
const qmlIds = { length: 1, 0: "c3" }
check("a row read back from QML keeps its collections into either detail path",
  JSON.stringify(Model.publicItemDetail({ id: "i5", organizationId: "o1", collectionIds: qmlIds, secretsHeld: true }).collectionIds) === JSON.stringify(["c3"])
    && JSON.stringify(Model.itemDetailFromObject({ id: "i6", type: 1, organizationId: "o1", collectionIds: qmlIds, login: {} }).collectionIds) === JSON.stringify(["c3"]),
  "expected c3 from an array-like")
check("a helper-held row keeps its collections into the detail",
  JSON.stringify(Model.publicItemDetail({ id: "i3", organizationId: "o1", collectionIds: ["c3"], secretsHeld: true }).collectionIds)
    === JSON.stringify(["c3"]), "expected c3")
check("a detail built from the full item keeps its collections",
  JSON.stringify(Model.itemDetailFromObject({ id: "i4", type: 1, organizationId: "o1", collectionIds: ["c2"], login: {} }).collectionIds)
    === JSON.stringify(["c2"]), "expected c2")

// --- payloads ---
// A personal item has no collections; sending the key at all would be wrong.
check("a personal item carries no collectionIds",
  !("collectionIds" in Model.buildCreatePayload(1, "n", "", "", "", "", "", false, null, null, ["c1"])),
  "expected the key to be absent")
check("an org item carries the chosen collections",
  JSON.stringify(Model.buildCreatePayload(1, "n", "", "", "", "", "", false, "o1", null, ["c1", "c2"]).collectionIds)
    === JSON.stringify(["c1", "c2"]), "expected both ids")
// Callers that predate collections pass ten arguments; they must not start
// sending an empty array, which is not the same as sending nothing.
check("an org item with no collections omits the key rather than sending []",
  !("collectionIds" in Model.buildCreatePayload(1, "n", "", "", "", "", "", false, "o1", null)),
  "expected the key to be absent")

const existing = { rawObject: { id: "1", type: 1, organizationId: "o1", collectionIds: ["keep"], login: {} } }
check("editing keeps existing collections when none are supplied",
  JSON.stringify(Model.buildEditPayload(existing, "n", "", "", "", "", "", false, "o1", null).collectionIds)
    === JSON.stringify(["keep"]), "expected the existing ids to survive")
check("editing replaces collections when new ones are supplied",
  JSON.stringify(Model.buildEditPayload(existing, "n", "", "", "", "", "", false, "o1", null, ["c9"]).collectionIds)
    === JSON.stringify(["c9"]), "expected the new ids")
check("moving an item to a personal vault drops its collections",
  !("collectionIds" in Model.buildEditPayload(existing, "n", "", "", "", "", "", false, null, null, [])),
  "expected the key to be removed")

// --- validation ---
// Bitwarden rejects an org item with no collection, so say so before the CLI does.
check("an org item with no collection is refused",
  Model.validateItemForm("n", "o1", []) !== "", Model.validateItemForm("n", "o1", []))
check("an org item with a collection is accepted",
  Model.validateItemForm("n", "o1", ["c1"]) === "", Model.validateItemForm("n", "o1", ["c1"]))
check("a personal item needs no collection",
  Model.validateItemForm("n", null, []) === "" && Model.validateItemForm("n", "personal", []) === "",
  "expected personal items to pass")
check("a blank title is still refused first",
  Model.validateItemForm("   ", "o1", ["c1"]).includes("title"), Model.validateItemForm("   ", "o1", ["c1"]))

done()
