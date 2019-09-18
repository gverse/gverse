import chalk from "chalk"
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

/* Catch any unhandled promises and report in logs */
process.on("unhandledRejection", (reason, p) => {
  console.warn("Unhandled Rejection at: Promise", p, "reason:", reason)
  // application specific logging, throwing an error, or other logic here
})

namespace Gverse {
  const DEFAULT_SCHEMA = "<type>: string @index(exact) ."

  export interface Environment {
    host: string
    port: number
    debug: boolean
  }

  export interface QueryOptions {
    // Sorting order, e.g. "orderasc:age" or "orderdesc:createdAt"
    order?: string
    /** Maximum number of vertices to return, useful for pagination with offset. */
    limit?: number
    /** Offset for paginated results. Use with limit. */
    offset?: number
  }

  /** Represents a dgraph transaction that can be created on demand or explicitly. */
  export class Transaction {
    private txn: dgraph.Txn
    private uuid: string = uuidv4()
    constructor(
      readonly connection: Connection,
      public autoCommit: boolean,
      verifyConnection = false
    ) {
      if (verifyConnection && (!connection || !connection.verified)) {
        const issue = "Can not create transaction. No verified connection."
        log(issue)
        throw issue
      }
      this.txn = connection.client.newTxn()
    }

    /** Commit the transaction and apply all operations. */
    async commit() {
      // todo check if transaction already committed
      await this.txn.commit()
      log(`Transaction ${this.uuid} committed`)
    }

    /** Discard all pending operations */
    async discard() {
      await this.txn.discard()
      log(`Transaction ${this.uuid} aborted`)
    }

    /** Returns object representation of the response JSON */
    async query(query: string, variables?: any) {
      log(
        `Transaction ${this.uuid} querying`,
        query,
        variables ? ` (variables: ${JSON.stringify(variables)})` : ""
      )
      try {
        const res = variables
          ? await this.txn.queryWithVars(query, variables)
          : await this.txn.query(query)
        log("Query response:", res.getJson())
        return res.getJson()
      } catch (e) {
        log(e)
        this.txn.discard()
      }
    }

    /** Mutate json-compliant object into graph space */
    async mutate(values: any) {
      log(`Transaction ${this.uuid} mutating`, JSON.stringify(values))
      try {
        const mu = new dgraph.Mutation()
        mu.setCommitNow(this.autoCommit)
        mu.setSetJson(values)
        const uidMap = await this.txn.mutate(mu)
        const createdUid = uidMap.getUidsMap().get("blank-0")
        log(`Transaction ${this.uuid} mutated with new uid`, createdUid)
        return createdUid
      } catch (e) {
        log(`Transaction ${this.uuid} mutate failed`, values, e)
        this.txn.discard()
        throw Error(e)
      }
    }

    /** Run an RDF mutation set a single predicate */
    async mutateNquads(
      subject: string,
      predicate: string,
      object: string
    ): Promise<string | undefined> {
      if (object === null) return
      const nquad = `${subject} <${predicate}> ${object} .`
      try {
        log(`Transaction ${this.uuid} mutating nquad: ${nquad}`)
        const mu = new dgraph.Mutation()
        mu.setCommitNow(this.autoCommit)
        mu.setSetNquads(nquad)
        const assigned = await this.txn.mutate(mu)
        return assigned.getUidsMap().get("blank-0")
      } catch (e) {
        log(`Transaction ${this.uuid} mutating failed`, nquad, e)
        this.txn.discard()
        throw Error(e)
      }
    }

    /** Run an RDF mutation to delete a single predicate */
    async deleteNquads(
      subject: string,
      predicate: string,
      object: string
    ): Promise<string | undefined> {
      if (object === null) return
      const nquad = `${subject} <${predicate}> ${object} .`
      try {
        log(`Transaction ${this.uuid} deleting Nquad: ${nquad}`)
        const mu = new dgraph.Mutation()
        mu.setCommitNow(this.autoCommit)
        mu.setDelNquads(nquad)
        const assigned = await this.txn.mutate(mu)
        return assigned.getUidsMap().get("blank-0")
      } catch (e) {
        log(`Transaction ${this.uuid} delete nquad failed`, nquad, e)
        this.txn.discard()
        throw Error(e)
      }
    }

    /** Delete vertices with given values. Values should be a list
     * of objects with uids or an object with uid.
     */
    async delete(values: any) {
      log(`Transaction ${this.uuid} deleting values`, values)
      if (!values.uid && values.length < 1) {
        log("Nothing to delete")
        return
      }
      try {
        const mu = new dgraph.Mutation()
        mu.setCommitNow(this.autoCommit)
        mu.setDeleteJson(values)
        const uid = await this.txn.mutate(mu)
        log(`Transaction ${this.uuid} deleted`, uid)
        return uid.getUidsMap().get("blank-0")
      } catch (e) {
        log(`Transaction ${this.uuid} delete failed`, values, e)
        this.txn.discard()
        throw Error(e)
      }
    }
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
          `Could not connect to Dgraph alpha at ${this.environment.host}:${this.environment.port}`,
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

  /** Graph represents a connected graph and convenient features graph operations
   * with vertices and edges.
   */
  export class Graph {
    constructor(private connection: Connection) {}
    indices: string = ""

    /** Verifies that a connection can be made to the graph server */
    async connect(announce: boolean = false) {
      if (!this.connection.verified) await this.connection.connect(announce)
      return await this.setIndices()
    }

    /** Connect to a given connection */
    async connectTo(connection: Connection, announce: boolean = false) {
      this.connection = connection
      this.connect(announce)
    }

    /** Get a new transaction on the current connection.
     * @param autoCommit Automatically commit after first mutation. Default: false
     */
    newTransaction(autoCommit: boolean = false) {
      return this.connection.newTransaction(autoCommit)
    }

    /** Deletes all vertices of matching */
    async clear(type?: string) {
      await this.connection.clear(type)
      return await this.setIndices()
    }

    /** Set up default Gverse schema and create all indices  */
    async setIndices() {
      log("Setting indices", this.indices)
      return await this.connection.applySchema(
        DEFAULT_SCHEMA + "\n" + this.indices
      )
    }

    /** Get a vertex from the graph with *all* predicates for given uid. */
    async get(
      vertexClass: typeof Vertex,
      uid: string,
      depth: number = 3,
      transaction?: Transaction
    ): Promise<Vertex | undefined> {
      log("Graph.get", vertexClass.name, uid)
      if (!uid) throw "No uid provided"
      const tx = transaction || this.connection.newTransaction(true)
      const res = await tx.query(
        `{vertex(func:uid(${uid})) @filter(has(type)) { ${Graph.expansion(
          depth
        )} }}`
      )
      if (res && res.vertex)
        return new vertexClass().unmarshal(res.vertex.pop())
      return undefined
    }

    /** Get values of any Vertex type by uid */
    async uid(
      uid: string,
      transaction?: Transaction,
      depth: number = 3
    ): Promise<any> {
      log("Graph.uid", uid)
      if (!uid) throw "No uid provided"
      const tx = transaction || this.connection.newTransaction(true)
      const res = await tx.query(
        `{vertex(func:uid(${uid})) @filter(has(type)) { ${Graph.expansion(
          depth
        )} }}`
      )
      if (res && res.vertex) return res.vertex.pop()
      else return undefined
    }

    /** Load a vertex from the graph with *all* predicates for given uid for
     * given depth. */
    async load(
      vertex: Vertex,
      depth: number = 3,
      transaction?: Transaction
    ): Promise<Vertex | undefined> {
      log("Graph.load", vertex.type, `(${vertex.uid})`)
      if (!vertex.uid) throw "Vertex instance requires uid"
      const tx = transaction || this.connection.newTransaction(true)
      const res = await tx.query(
        `{vertex(func:uid(${
          vertex.uid
        })) @filter(has(type)) { ${Graph.expansion(depth)} }}`
      )
      if (res && res.vertex) return vertex.unmarshal(res.vertex.pop())
      else return undefined
    }

    /** Query and unmarshal matching vertices using full GraphQL± query.
     * Result must be named "vertices" for unmarshaling to work. E.g.
     *   `{vertices(func:uid("0x1)) { uid name }}`.
     *
     * For custom queries that do not require unmarshaling, use Transaction.query.
     */
    async query(
      vertexClass: typeof Vertex,
      query: string,
      parameters: any = {},
      transaction?: Transaction,
      depth: number = 3
    ): Promise<Vertex[] | undefined> {
      log("Graph.query", vertexClass.name, query)
      const tx = transaction || this.connection.newTransaction(true)
      const res = await tx.query(query, parameters)
      if (!res) return []
      const vertices: Vertex[] = res.vertices.map((values: any) => {
        return new vertexClass().unmarshal(values)
      })
      return vertices
    }

    /** Query and unmarshal matching vertices based on given Dgraph function.
     * Query function Can include order.
     *
     * Examples:
     * ```
      queryWithFunction(Pet, "eq(name, Oreo)")
      queryWithFunction(Pet, "eq(type, Pet), orderdesc:createdAt")
      queryWithFunction(Pet, "eq(type, Pet), orderasc:age")
     ```
     */
    async queryWithFunction(
      vertexClass: typeof Vertex,
      queryFunction: string,
      transaction?: Transaction,
      depth: number = 3
    ): Promise<Vertex[] | undefined> {
      log("Graph.queryWithFunction", vertexClass.name, queryFunction)
      return await this.query(
        vertexClass,
        `{vertices(func:${queryFunction}) @filter(eq(type, ${
          vertexClass.name
        })) { ${Graph.expansion(depth)} }}`,
        {},
        transaction,
        depth
      )
    }

    /** Query and unmarshal matching vertices */
    async all(
      vertexClass: typeof Vertex,
      { order, limit, offset }: QueryOptions = {},
      transaction?: Transaction,
      depth: number = 3
    ): Promise<Vertex[] | undefined> {
      limit = (limit && limit < 10000 && limit) || 1000
      const orderPhrase = (order && `, ${order}`) || ""
      const limitPhrase = `, first:${limit}`
      const offsetPhrase = (offset && `, offset:${offset}`) || ""
      log("Graph.all", vertexClass.name)
      return await this.queryWithFunction(
        vertexClass,
        `eq(type,"${vertexClass.name}") ${orderPhrase} ${limitPhrase} ${offsetPhrase}`,
        transaction,
        depth
      )
    }

    /** Get the first vertex from the graph with matching `predicate = value`. */
    async first(
      vertexClass: typeof Vertex,
      { predicate, value }: { predicate: string; value: string },
      transaction?: Transaction,
      depth: number = 3
    ): Promise<Vertex | undefined> {
      log("Graph.first", vertexClass.name, predicate, "=", value)
      const matches = await this.queryWithFunction(
        vertexClass,
        `eq(${predicate}, ${value})`,
        transaction,
        depth
      )
      return matches ? matches.pop() : undefined
    }

    /** Create a vertex in the graph based on given instance. Returns the vertex with new uid. */
    async create(
      vertex: Vertex,
      traverse: boolean = false,
      transaction?: Transaction
    ): Promise<Vertex | undefined> {
      log("Graph.create", vertex)
      const tx = transaction || this.connection.newTransaction(true)
      await vertex.beforeCreate(vertex.marshal(traverse))
      // marshal again to get any updated values from beforeUpdate
      let values: any = vertex.marshal(traverse)
      log("Graph.create after hook values:", values)
      const createdUid = await tx.mutate(values)
      if (createdUid) {
        vertex.uid = createdUid
        await vertex.afterCreate(values)
      }
      return vertex
    }

    /** Create a vertex in the graph based on given prototype. Returns the vertex with new uid. */
    async delete(
      vertex: Vertex,
      traverse: boolean = false,
      transaction?: Transaction
    ): Promise<boolean> {
      log("Graph.delete", vertex)
      if (!vertex.uid) throw "Can not delete a vertex without a uid"
      const tx = transaction || this.connection.newTransaction(true)
      let values: any = vertex.marshal(traverse)
      await vertex.beforeDelete(values)
      const delMut = { uid: vertex.uid }
      await tx.delete(delMut)

      log("Deleted", vertex.uid)
      await vertex.afterDelete(values)
      return true
    }

    /** Save the current values into the graph. Returns the vertex with uid. */
    async update(
      vertex: Vertex,
      traverse: boolean = false,
      transaction?: Transaction
    ): Promise<Vertex | undefined> {
      log("Graph.save", vertex)
      if (!vertex.uid) throw "Can not save a vertex without a uid"
      const tx = transaction || this.connection.newTransaction(true)
      const currentValues = await this.uid(vertex.uid, tx, 3)
      await vertex.beforeUpdate(currentValues, vertex.marshal(traverse))

      // marshal again to get any updated values from beforeUpdate
      let values: any = vertex.marshal(traverse)
      await tx.mutate(values)
      await vertex.afterUpdate(currentValues, values)
      return vertex
    }

    /** Save the current values into the graph. Returns the vertex with uid. */
    async save(
      vertex: Vertex,
      traverse: boolean = false,
      transaction?: Transaction
    ): Promise<Vertex | undefined> {
      if (!vertex.uid) throw "Can not save a vertex without a uid"
      const tx = transaction || this.connection.newTransaction(true)
      const values = vertex.marshal(traverse)
      await tx.mutate(values)
      return vertex
    }

    /** High performance set properties (predicate values) as is on a vertex of given UID.
     * Do not pass vertices as values. Pass just the values you want to mutate.
     *
     * E.g.: `Graph.set(person.uid, {name: "Zak"})`
     *
     * Note: This method is for fast mutation without type-validation and hooks.
     */
    async set(
      uid: string,
      values: any,
      transaction?: Transaction
    ): Promise<string | undefined> {
      log("Graph.set", uid, values)
      const tx = transaction || this.connection.newTransaction(true)
      values.uid = uid // flatten it for dgraph
      // remove special keys
      let vertexValues = Object.assign({}, values)
      Object.keys(values)
        .filter(k => k.startsWith("_"))
        .forEach(k => delete vertexValues[k])
      return await tx.mutate(vertexValues)
    }

    /** Connect a vertex (subject) to another vertex (object) as predicate */
    async link(
      from: Vertex,
      to: Vertex,
      predicate: string,
      transaction?: Transaction
    ): Promise<string | undefined> {
      if (from.uid && to.uid) {
        const tx = transaction || this.connection.newTransaction(true)
        return await tx.mutateNquads(`<${from.uid}>`, predicate, `<${to.uid}>`)
      }
    }

    /** Disconnect a vertex (object) from another vertex (subject) as predicate */
    async unlink(
      from: Vertex,
      to: Vertex,
      predicate: string,
      transaction?: Transaction
    ): Promise<string | undefined> {
      if (from.uid && to.uid) {
        const tx = transaction || this.connection.newTransaction(true)
        return await tx.deleteNquads(`<${from.uid}>`, predicate, `<${to.uid}>`)
      }
    }

    /** Disconnect the associated connection */
    async disconnect() {
      if (this.connection) await this.connection.disconnect()
    }

    /** Returns the JSON expansion phrase for nested vertices */
    static expansion(depth: number) {
      if (depth < 1 || depth > 10)
        throw "Invalid depth. Should be between 1 and 10."
      return Graph.Depths[depth]
    }

    /** Create an array of expansion phrases */
    static Depths: Array<string> = (() => {
      const nest = (s: string): string => `uid expand(_all_) { ${s} }`
      let expression = "uid expand(_all_)"
      let depths = []
      for (var i = 1; i < 11; i++) {
        depths[i] = expression
        expression = nest(expression)
      }
      return depths
    })()
  }

  /** Cardinality of edges connecting 0-1 or 0-N vertices */
  export enum Cardinality {
    Single,
    Multiple
  }

  /** Direction of edges to support direction or bidirectional connection */
  export enum Direction {
    Directed,
    Undirected
  }

  /** Represents an edge that connect a vertex to one or more vertices.
   * Vertex class should contain _edges to define the edge properties.
   * E.g. ``` _edges = { father: Edge.toVertex(Father) } ```
   * @todo @future Support facets
   */
  export class Edge {
    type: typeof Vertex = Vertex
    cardinality: Cardinality = Cardinality.Multiple
    reverseEdgeName: string = "" // blank implies directed

    /** Create an edge definition for zero or one vertex */
    static toVertex(
      type: typeof Vertex,
      { reverseOf }: { reverseOf?: string } = {}
    ): Edge {
      return Gverse.Edge.buildEdge(type, Cardinality.Single, { reverseOf })
    }

    /** Get direction of the edge */
    get direction(): Direction {
      return this.reverseEdgeName === ""
        ? Direction.Directed
        : Direction.Undirected
    }

    /** Create an edge definition for 0 or more vertices */
    static toVertices(
      type: typeof Vertex,
      { reverseOf }: { reverseOf?: string } = {}
    ): Edge {
      return Gverse.Edge.buildEdge(type, Cardinality.Multiple, { reverseOf })
    }

    private static buildEdge(
      type: typeof Vertex,
      cardinality: Cardinality,
      { reverseOf }: { reverseOf?: string } = {}
    ): Edge {
      const edge = new Edge()
      edge.type = type
      edge.cardinality = cardinality
      if (reverseOf) edge.reverseEdgeName = reverseOf
      return edge
    }
  }

  /** Represents a vertex and connected edges and vertices.
   * Note: A vertex class must have an no-argument constructor
   * and default values for all property predicates.
   * E.g.
   * ```
   class Person extends Gverse.Vertex {
     name: string = ""
     mother?: Person
     children?: Array<Person> = []
     _edges = {
       mother: Gverse.Edge.toVertex(Person),
       children: Gverse.Edge.toVertices(Person)
     }
     create(name: string) {
       const person = new Person()
       person.name = name
       return person.craeteInto(graph)
     }
   }
   ```
   */
  export class Vertex {
    uid: string | undefined
    /** Vertex type: Required for all vertices and stored as indexed predicate */
    type: string = "Vertex"
    /** Defines the edges and their cardinalities. E.g.:
     * `_edges = { mother: Gverse.Edge.toVertex(Person), children: Gverse.Edge.toVertices(Person) }`
     */
    _edges: any = {}
    _graph?: Graph

    /** Apply operations on the provided graph instance */
    set graph(graph: Graph) {
      this._graph = graph
    }

    get graph(): Graph {
      return this._graph as any
    }

    /// - Convenience methods

    /** Load the latest state from the graph */
    async loadFrom(graph: Gverse.Graph): Promise<any> {
      const updated = await graph.load(this)
      this._graph = graph
      return updated
    }

    /** Save the current state of the vertex to the graph.
     * @param traverse whether or not do marshal linked edges
     */
    async saveInto(graph: Gverse.Graph, traverse = false): Promise<boolean> {
      this._graph = graph
      return !!(await graph.update(this, traverse))
    }

    /** Creates the given vertex to the graph.
     * @param traverse whether or not do marshal linked edges
     */
    async createInto(graph: Gverse.Graph, traverse = false): Promise<any> {
      this._graph = graph
      return await graph.create(this, traverse)
    }

    /** Deletes the given vertex from the graph.
     * @param traverse whether or not do marshal linked edges
     */
    async deleteFrom(graph: Gverse.Graph, traverse = false): Promise<any> {
      this._graph = graph
      return await graph.delete(this, traverse)
    }

    /// -  Mutation hooks

    /** Hook for before create processing. Called just before creating in the graph. */
    async beforeCreate(values: any): Promise<any> {
      log(`Before create ${this.type}:`, values)
    }

    /** Hook for after create processing. Called right after creation. */
    async afterCreate(values: any): Promise<any> {
      log(`After create ${this.type}:`, values)
    }

    /** Hook for before update processing Called just before updating the graph.*/
    async beforeUpdate(beforeValues: any, afterValues: any): Promise<any> {
      log(`Before update ${this.type}`, beforeValues, "->", afterValues)
    }

    /** Hook for after update processing. Called right after update. */
    async afterUpdate(beforeValues: any, afterValues: any): Promise<any> {
      log(`After update ${this.type}`, beforeValues, "->", afterValues)
    }

    /** Hook for before delete processing. Called just before deleting from the graph.*/
    async beforeDelete(values: any): Promise<any> {
      log(`Before delete ${this.type}:`, values)
    }

    /** Hook for after delete  processing. Called right after deleting from the graph. */
    async afterDelete(values: any): Promise<any> {
      log(`After delete ${this.type}:`, values)
    }

    /** Get all values as JSON-complaint object.
     * @param traverse whether or not do marshal linked edges
     */
    autoMarshal(traverse = true): any {
      let vertex: any = this
      let values: any = {}
      Object.getOwnPropertyNames(vertex).forEach(key => {
        let predicate: any = vertex[key]
        // ignore _* private instance variables and special variables
        if (!key.startsWith("_")) {
          if (vertex[key] && key in this._edges) {
            if (traverse) {
              // handle edge predicates
              const edge = this._edges[key]
              if (edge.direction == Direction.Undirected) {
                log("Skipping reverse edge marshaling for", edge)
              } else {
                if (Array.isArray(predicate)) {
                  predicate = predicate.map(p => {
                    return p.marshal()
                  })
                } else {
                  if (predicate instanceof Vertex)
                    predicate = predicate.marshal()
                }
                values[key] = predicate
              }
            }
          } else {
            values[key.replace("$", "@")] = predicate
          }
        }
      })
      return values
    }

    /** Unmarshal through introspection */
    autoUnmarshal(vertex: any, values: any): any {
      // reset all edges
      for (let key in this._edges) {
        vertex[key] = undefined
      }
      // apply reverse edges
      for (let key in this._edges) {
        const edge = this._edges[key]
        if (edge.direction == Direction.Undirected) {
          values[key] = values[`~${edge.reverseEdgeName}`]
          delete values[`~${edge.reverseEdgeName}`]
        }
      }

      // assign all values to the vertex
      for (let key in values) {
        if (!key.startsWith("_")) {
          // skip special keys
          let val: any = values[key]
          // assign edges as vertex object or array of vertex objects
          if (key in this._edges) {
            if (Array.isArray(val)) {
              const edge = this._edges[key] as Edge
              if (edge.cardinality === Cardinality.Single) {
                const v = val.pop()
                val = new edge.type().unmarshal(v) as Vertex
              } else {
                val = val.map(v => {
                  return new edge.type().unmarshal(v) as Vertex
                })
              }
            }
          }
          vertex[key.replace("@", "$")] = val
        }
      }
      return vertex
    }

    /** Property is true when product has a Dgraph UID. */
    existsInGraph(): boolean {
      return !!this.uid
    }

    /** Get JSON-complaint object representation. By default, it uses the [[autoMarshal]] feature.
     * @param traverse whether or not do marshal linked edges
     */
    marshal(traverse = true): any {
      return this.autoMarshal(traverse)
    }

    /** Set predicates from JSON-compliant values */
    unmarshal(values: any): any {
      return this.autoUnmarshal(this, values) as Vertex
    }
  }
}

export default Gverse
