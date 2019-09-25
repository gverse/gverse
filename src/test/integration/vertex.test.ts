import Gverse from "../../gverse"
import {
  Pet,
  Owner,
  Origin,
  VertexFixtures,
  conn,
  graph
} from "./vertex_fixtures"

describe("Vertex", () => {
  let pet: Pet
  let owner: Owner
  let origin: Origin
  let fixtures: VertexFixtures

  beforeAll(async () => {
    await graph.connect()
  })

  afterAll(async () => {
    await graph.disconnect()
  })

  beforeEach(async () => {
    await conn.clear(Pet.name)
    fixtures = await new VertexFixtures().build()
    pet = fixtures.pet || fail()
    owner = fixtures.owner || fail()
    origin = fixtures.origin || fail()
  })

  it("has uid", async () => {
    expect(pet.uid).toBeDefined()
  })

  describe("marshaling", () => {
    it("auto marshals", async () => {
      const tom = new Pet()
      tom.name = "Tom"
      tom.name$ur = "ٹوم"
      const values = tom.marshal()
      expect(values.name).toBe("Tom")
      expect(values).not.toContain("graph")
      expect(values["name@ur"]).toBe("ٹوم")
    })
  })

  describe("querying", () => {
    it("gets all", async () => {
      const pets = (await graph.all(
        (Pet as any) as typeof Gverse.Vertex
      )) as Array<Pet>
      const names = pets.map((p: Pet) => p.name)
      expect(names).toEqual(["Biggles"])
    })
    it("gets first", async () => {
      const pet = (await graph.first((Pet as any) as typeof Gverse.Vertex, {
        predicate: "name",
        value: "Biggles"
      })) as Pet
      expect(pet.name).toBe("Biggles")
    })
  })
  describe("updating", () => {
    it("sets values", async () => {
      const oldBreed = "Cat"
      const newBreed = "Sphinx"
      expect(pet.breed).toBe(oldBreed) // precondition
      if (!pet.uid) fail("No uid")
      else {
        await graph.set(pet.uid, { breed: newBreed })
        // @ts-ignore
        let updatedPet = (await graph.get(Pet, pet.uid)) as Pet
        expect(updatedPet.breed).toBe(newBreed)
      }
    })
    it("updates", async () => {
      const oldBreed = "Cat"
      const newBreed = "Sphinx"
      expect(pet.breed).toBe(oldBreed) // precondition
      if (!pet.uid) fail("No uid")
      else {
        pet.breed = newBreed
        await pet.saveInto(graph)
        let updatedPet = (await graph.get(Pet, pet.uid)) as Pet
        expect(updatedPet.breed).toBe(newBreed)
      }
    })
  })
  it("deletes", async () => {
    if (pet.uid) {
      expect(pet).toBeDefined()
      await pet.deleteFrom(graph)
      const deletedPet = await graph.get(Pet, pet.uid)
      if (deletedPet) expect(deletedPet.existsInGraph()).toBe(false)
    } else fail("No pet")
  })
  describe("Linking", () => {
    it("links and unlinks", async () => {
      expect(pet.owner).toBeUndefined()
      const linkedPet = await pet.getAdoptedBy(owner)
      expect(linkedPet.owner).toEqual(owner)
      const unLinkedPet = await pet.escape(owner)
      expect(unLinkedPet.owner).toBeUndefined()
    })
    it("marshals directed edges", async () => {
      expect(pet.owner).toBeUndefined()
      const linkedPet = await pet.getAdoptedBy(owner)
      expect(linkedPet.marshal().owner).toEqual(owner.marshal())
    })
    it("doesn not marshal undirected edges", async () => {
      pet.origin = origin
      await pet.saveInto(graph)
      const originWithPet = await origin.loadFrom(graph)
      const values: any = originWithPet.marshal()
      expect(values.pets).toBeUndefined()
    })
    it("undirectioned link", async () => {
      expect(origin.pets).toBeUndefined()
      pet.origin = origin
      // traverse = true to link origin to pet
      await pet.saveInto(graph, true)
      const updatedPet = await pet.loadFrom(graph)
      const updatedOrigin = await origin.loadFrom(graph)
      expect(pet.origin.uid).toEqual(origin.uid)
      expect(updatedOrigin.pets[0].uid).toEqual(pet.uid)
      // updating a linked object
      updatedOrigin.name = "Canada"
      const saved = await updatedOrigin.saveInto(graph)
    })
  })
  describe("hooks", () => {
    it("calls before and after create", async () => {
      let pet = new Pet()
      expect(pet.beforeCreateSet).toBe(false)
      expect(pet.afterCreateSet).toBe(false)
      pet = (await graph.create(pet)) as Pet
      await graph.save(pet) // apply afterCreate
      const petFromGraph = (await pet.loadFrom(graph)) as Pet
      expect(petFromGraph).toBeDefined()
      expect(petFromGraph.beforeCreateSet).toBe(true)
      expect(petFromGraph.afterCreateSet).toBe(true)
    })

    it("calls before and after update", async () => {
      expect(pet.beforeUpdateSet).toBe(false)
      pet.name = "Garfield"
      await pet.saveInto(graph) // apply beforeUpdate
      await pet.saveInto(graph) // apply afterUpdate
      const petFromGraph = (await pet.loadFrom(graph)) as Pet
      expect(petFromGraph).toBeDefined()
      expect(petFromGraph.beforeUpdateSet).toBe(true)
      expect(petFromGraph.afterUpdateSet).toBe(true)
    })

    it("calls before and after delete", async () => {
      expect(pet.beforeDeleteSet).toBe(false)
      expect(pet.afterDeleteSet).toBe(false)
      let deletedPet = await pet.deleteFrom(graph)
      expect(deletedPet).toBeDefined()
      expect(pet.beforeDeleteSet).toBe(true)
      expect(pet.afterDeleteSet).toBe(true)
    })
  })
  describe("language support", () => {
    it("updates secondary languages", async () => {
      const otherName = "بلئ"
      expect(pet.name$ur).toEqual("")
      pet.name$ur = otherName
      await pet.saveInto(graph)
      const petFromGraph = (await pet.loadFrom(graph)) as Pet
      if (!petFromGraph) fail("Not found")
      else expect(petFromGraph.name$ur).toEqual(otherName)
    })
  })
})
