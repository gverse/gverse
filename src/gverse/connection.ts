import chalk from "chalk" // todo: find typescript equivalent
import debug from "debug"
import * as dgraph from "dgraph-js"
import * as grpc from "grpc"
import uuidv4 from "uuid/v4"
import _ from "lodash"

/* To see Gverse debug logs, run the scrpit or test, set environment variable:
 * `DEBUG=Gverse <script ...>`
 */
const log = debug("Gverse")
const preventClearInProduction = false

export interface Environment {
  host: string
  port: number
  debug: boolean
}

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
      const tx = new Transaction(this, true, false)
      const res = await tx.query(
        `{total (func: has(_predicate_)) {count(uid)}}`
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
        `Could not connect to Dgraph alpha at ${this.environment.host}:${
          this.environment.port
        }`,
        error
      )
      this.verified = false
      return false
    }
  }

  /** Returns a new transaction with auto commit (immediate) option. */
  newTransaction(autoCommit = false): Transaction {
    return new Transaction(this, autoCommit)
  }

  /** Immediate query with autoCommit transaction */
  async query(query: any, variables?: any) {
    return await this.newTransaction(true).query(query, variables)
  }

  /** Clears the graph by dropping all vertices, edges and predicates
   * of the given type - or all types.
   */
  async clear(type?: string) {
    if (preventClearInProduction && this.environment.host != "localhost")
      throw "Reset not allowed in non-local host dgraph server"
    try {
      if (type) {
        log("Clearing vertices of type", type)
        const res = await this.query(
          `{vertices (func: eq(type, "${type}")) { uid }}`
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
      log(e)
      throw e
    }
  }

  async applySchema(schema: string) {
    try {
      log("Apply schema", schema)
      const op = new dgraph.Operation()
      op.setSchema(schema)
      await this.client.alter(op)
    } catch (e) {
      log(e)
      throw e
    }
  }

  async disconnect() {
    log("Disconnecting from dgraph")
    await this.stub.close()
  }
}
