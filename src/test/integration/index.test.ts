import Gverse from "../../gverse"

const config: Gverse.Environment = {
  host: "server",
  port: 9080,
  debug: false
}

describe("Gverse", () => {
  describe("Connection", () => {
    it("connects and disconnects", async () => {
      const connection = new Gverse.Connection(config)
      expect(await connection.connect()).toBeTruthy()
      await connection.disconnect()
    })
  })
  describe("Transaction", () => {
    const conn = new Gverse.Connection(config)
    const type = "TestVertex"

    beforeAll(async () => {
      await conn.connect()
    })
    afterAll(async () => {
      await conn.disconnect()
    })

    beforeEach(async () => {
      await conn.clear(type)
    })

    it("mutates", async () => {
      const tx = conn.newTransaction(true)
      await tx.mutate({ pet: { name: "Bigglesworth", "dgraph.type": type } })
    })
    it("runs simple upsert", async () => {
      const tx = conn.newTransaction(true)
      await tx.mutate({
        pet: { name: "James Bigglesworth", "dgraph.type": type }
      })

      const query = `{vertex as var(func: type(${type})) }`
      const values = {
        uid: "uid(vertex)",
        nickName: "Biggles"
      }
      await conn.newTransaction().upsert(query, values)
    })
    it("runs conditional upsert", async () => {
      const tx = conn.newTransaction(true)
      await tx.mutate({
        pet: { name: "James Bigglesworth", "dgraph.type": type }
      })

      const query = `{vertex as var(func: type(${type})) }`
      const values = {
        uid: "uid(vertex)",
        nickName: "Biggles"
      }
      const condition = `eq(len(vertex), 1)`
      await conn.newTransaction().upsert(query, values, condition)
    })
    it("queries", async () => {
      const tx = conn.newTransaction(true)
      await tx.mutate({ pet: { name: "Biggles", "dgraph.type": type } })
      const res = await conn
        .newTransaction()
        .query(`{pets(func:type(${type})) {name}}`)
      expect(res.pets[0].name).toBe("Biggles")
    })
    it("language support", async () => {
      const urduName = "الفا"
      await conn.applySchema(`
        <type>: string @index(exact) .
        <name>: string @lang .
      `)
      const tx = conn.newTransaction(true)
      await tx.mutate({
        pet: { name: "Alpha", "name@ur": urduName, "dgraph.type": type }
      })
      const res = await conn
        .newTransaction()
        .query(`{pets(func:type(${type})) {name name@ur}}`)
      expect(res.pets[0].name).toBe("Alpha")
      expect(res.pets[0]["name@ur"]).toBe(urduName)
    })
    it("deletes", async () => {
      const tx = conn.newTransaction(true)
      const newUid = await tx.mutate({
        pet: { name: "Bigglesworth", "dgraph.type": type }
      })
      expect(newUid).toBeDefined()
      await conn.newTransaction(true).delete({ uid: newUid })
      const res = await conn
        .newTransaction(true)
        .query(`{ pets(func:uid(${newUid})) @filter(type(${type})) {uid} }`)
      expect(res.pets).toEqual([])
    })
    it("retries conflicting transactions", async () => {
      const tx = conn.newTransaction(true)
      const uid = await tx.mutate({
        pet: { name: "Transient", "dgraph.type": type }
      })
      await Promise.all([
        conn.newTransaction(true).mutate({ uid, name: "Name" }),
        conn.newTransaction(true).delete({ uid }),
        conn.newTransaction(true).mutate({ uid, name: "New Name" })
      ])
    })
  })
  describe("Graph", () => {
    it("has expansions", () => {
      expect(Gverse.Graph.expansion(1)).toEqual("uid expand(_all_)")
      expect(Gverse.Graph.expansion(2)).toEqual(
        "uid expand(_all_) { uid expand(_all_) }"
      )
      expect(() => Gverse.Graph.expansion(0)).toThrow()
      expect(() => Gverse.Graph.expansion(11)).toThrow()
    })
  })
})
