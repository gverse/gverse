import Gverse from "../../gverse"

describe("Connection", () => {
  it("connects", async () => {
    Gverse.Transaction.prototype.query = jest.fn(
      (string: string, variables: any): Promise<any> => Promise.resolve()
    )
    const conn = await new Gverse.Connection({
      host: "localhost",
      port: 9999,
      debug: true
    })
    await conn.connect()
  })
})
