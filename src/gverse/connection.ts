import * as dgraph from "dgraph-js"
import * as grpc from "grpc"
import chalk from "chalk"
import log from "./debug-logger"
import { Transaction } from "./transaction"
import { shouldRetry, waitPromise } from "./retry"

/** Connection environment */
export interface Environment {
  host: string
  port: number
  debug: boolean
}

/* Catch any unhandled promises and report in logs */
process.on("unhandledRejection", (reason, p) => {
  console.warn("Unhandled Rejection at: Promise", p, "reason:", reason)
  // application specific logging, throwing an error, or other logic here
})

/** Connection represents a GRPC connection to the dgraph server. */
export class Connection {
  stub: dgraph.DgraphClientStub
  client: dgraph.DgraphClient
  public verified: boolean = false

  constructor(private environment: Environment) {
    this.stub = new dgraph.DgraphClientStub(
      `${environment.host}:${environment.port}`,
      grpc.credentials.createInsecure()
    )
    this.client = new dgraph.DgraphClient(this.stub)
    this.client.setDebugMode(environment.debug)
  }

  /** Verifies the connection. There's no connect operation per-se. */
  async connect(announce: boolean = false): Promise<boolean> {
    try {
      const tx = new Transaction(this, true, false, true)
      const res = await tx.query(
        `{total (func: has(dgraph.type)) {count(uid)}}`
      )
      if (announce)
        console.log(
          "🔅 Connected to",
          "Dgraph zero at",
          chalk.blue.bold(this.environment.host) +
            ":" +
            chalk.blue.bold(`${this.environment.port}`),
          "with",
          chalk.cyan.bold(res.total.pop().count),
          "vertices\n"
        )
      this.verified = true
      log("Connected to dgraph")
      return true
    } catch (error) {
      log(
        `Could not connect to Dgraph alpha at ${this.environment.host}:${this.environment.port}`,
        error
      )
      this.verified = false
      return false
    }
  }

  /** Returns a new transaction with auto commit (immediate) option. */
  newTransaction(autoCommit = false, readOnly = false): Transaction {
    return new Transaction(this, autoCommit, false, readOnly)
  }

  /** Immediate query with autoCommit transaction */
  async query(query: any, variables?: any) {
    return await this.newTransaction(true, true).query(query, variables)
  }

  /** Clears the graph by dropping all vertices, edges and predicates
   * of the given type - or all types.
   */
  async clear(type?: string) {
    try {
      if (type) {
        log("Clearing vertices of type", type)
        const res = await this.query(
          `{vertices (func: type("${type}")) { uid }}`
        )
        if (res && res.vertices)
          await this.newTransaction(true).delete(res.vertices)
      } else {
        log("Clearing all vertices")
        const op = new dgraph.Operation()
        op.setDropAll(true)
        await this.client.alter(op)
      }
    } catch (e) {
      log("Failed to clear:", e)
      throw Error(e)
    }
  }

  async applySchema(schema: string, retries = 0): Promise<any> {
    try {
      log("Apply schema take", retries, "schema: ", schema)
      const op = new dgraph.Operation()
      op.setSchema(schema)
      await this.client.alter(op)
    } catch (e) {
      if (shouldRetry(e, retries)) {
        await waitPromise(`schema ${schema}`)
        return await this.applySchema(schema, retries + 1)
      } else {
        log(e)
        throw Error(e)
      }
    }
  }
  async disconnect() {
    log("Disconnecting from dgraph")
    await this.stub.close()
  }
}
