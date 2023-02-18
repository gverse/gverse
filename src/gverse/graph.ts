import { Connection } from "./connection"
import log from "./debug-logger"
import { waitPromise } from "./retry"
import { Transaction } from "./transaction"
import { Vertex } from "./vertex"

export interface QueryOptions {
  // Sorting order, e.g. "orderasc:age" or "orderdesc:createdAt"
  order?: string
  /** Maximum number of vertices to return, useful for pagination with offset. */
  limit?: number
  /** Offset for paginated results. Use with limit. */
  offset?: number
}

const SchemaBuildTime = 100 // ms to wait after schema change

/** Graph represents a connected graph and convenient features graph operations
 * with vertices and edges.
 */
export class Graph {
  private connection: Connection
  constructor(connection: Connection) {
    this.connection = connection
  }
  indices: string = ""
  types: string = ""

  /** Verifies that a connection can be made to the graph server */
  async connect(announce: boolean = false) {
    if (!this.connection.verified) await this.connection.connect(announce)
    return await this.setIndicesAndTypes()
  }

  /** Connect to a given connection */
  async connectTo(connection: Connection, announce: boolean = false) {
    this.connection = connection
    void this.connect(announce)
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
    log("Warning: Schema was dropped - recreating.")
    if (type == undefined) {
      // schema was dropped, recreate
      await this.setIndicesAndTypes()
    }
  }

  /** Set up default Gverse schema and create all indices  */
  async setIndicesAndTypes() {
    log("Setting indices", this.indices)
    log("Setting types", this.types)
    await this.connection.applySchema(this.indices + "\n" + this.types)
    return await waitPromise("set indices", SchemaBuildTime)
  }

  /** Get a vertex from the graph with *all* predicates for given uid. */
  async get(
    vertexClass: typeof Vertex,
    uid: string,
    depth: number = 3,
    transaction?: Transaction
  ): Promise<Vertex | undefined> {
    log("Graph.get", vertexClass.name, uid)
    if (!uid) throw Error("No uid provided")
    const tx = transaction ?? this.connection.newTransaction(true)
    const res = await tx.query(
      `{vertex(func:type(${
        vertexClass.name
      })) @filter(uid(${uid})) { ${Graph.expansion(depth)} }}`
    )
    if (res?.vertex) return new vertexClass().unmarshal(res.vertex.pop())
    return undefined
  }

  /** Get values of any Vertex type by uid */
  async uid(
    uid: string,
    transaction?: Transaction,
    depth: number = 3
  ): Promise<any> {
    log("Graph.uid", uid)
    if (!uid) throw new Error("No uid provided")
    const tx = transaction ?? this.connection.newTransaction(true)
    const res = await tx.query(
      `{vertex(func:uid(${uid})) @filter(has(dgraph.type)) { ${Graph.expansion(
        depth
      )} }}`
    )
    if (res?.vertex) return res.vertex.pop()
    return undefined
  }

  /** Load a vertex from the graph with *all* predicates for given uid for
   * given depth. */
  async load(
    vertex: Vertex,
    depth: number = 3,
    transaction?: Transaction
  ): Promise<Vertex | undefined> {
    log("Graph.load", vertex.type, `(${vertex.uid})`)
    if (!vertex.uid) throw new Error("Vertex instance requires uid")
    const tx = transaction ?? this.connection.newTransaction(true)
    const res = await tx.query(
      `{vertex(func:uid(${
        vertex.uid
      })) @filter(has(dgraph.type)) { ${Graph.expansion(depth)} }}`
    )
    if (res?.vertex) return vertex.unmarshal(res.vertex.pop())
    return undefined
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
    const tx = transaction ?? this.connection.newTransaction(true)
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
      `{vertices(func:${queryFunction}) @filter(type( ${
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
    { order, limit = 1000, offset }: QueryOptions = {},
    transaction?: Transaction,
    depth: number = 3
  ): Promise<Vertex[] | undefined> {
    limit = limit < 10000 ? limit : 1000
    const orderPhrase = (order && `, ${order}`) ?? ""
    const limitPhrase = `, first:${limit}`
    const offsetPhrase = (offset && `, offset:${offset}`) ?? ""
    log("Graph.all", vertexClass.name)
    return await this.queryWithFunction(
      vertexClass,
      `type(${vertexClass.name}) ${orderPhrase} ${limitPhrase} ${offsetPhrase}`,
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
    const tx = transaction ?? this.connection.newTransaction(true)
    await vertex.beforeCreate(vertex.marshal(traverse))
    // marshal again to get any updated values from beforeUpdate
    const values: any = vertex.marshal(traverse)
    // Replacing type with dgraph.type
    values["dgraph.type"] = values.type
    delete values.type
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
    if (!vertex.uid) throw new Error("Can not delete a vertex without a uid")
    const tx = transaction ?? this.connection.newTransaction(true)
    const values: any = vertex.marshal(traverse)
    await vertex.beforeDelete(values)
    const delMut = { uid: vertex.uid }
    const res = await tx.delete(delMut)
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
    if (!vertex.uid) throw new Error("Can not save a vertex without a uid")
    const tx = transaction ?? this.connection.newTransaction(true)
    const currentValues = await this.uid(vertex.uid, tx, traverse ? 3 : 1)
    await vertex.beforeUpdate(currentValues, vertex.marshal(traverse))

    // marshal again to get any updated values from beforeUpdate
    const values: any = vertex.marshal(traverse)
    const updated = await tx.mutate(values)

    if (updated) await vertex.afterUpdate(currentValues, values)
    return vertex
  }

  /** Save the current values into the graph. Returns the vertex with uid. */
  async save(
    vertex: Vertex,
    traverse: boolean = false,
    transaction?: Transaction
  ): Promise<Vertex | undefined> {
    if (!vertex.uid) throw new Error("Can not save a vertex without a uid")
    const tx = transaction ?? this.connection.newTransaction(true)
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
    const tx = transaction ?? this.connection.newTransaction(true)
    values.uid = uid // flatten it for dgraph
    // remove special keys
    const vertexValues = Object.assign({}, values)
    /* eslint-disable @typescript-eslint/no-dynamic-delete */
    Object.keys(values)
      .filter((k) => k.startsWith("_"))
      .forEach((k) => delete vertexValues[k])
    /* eslint-disable @typescript-eslint/no-dynamic-delete */
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
      const tx = transaction ?? this.connection.newTransaction(true)
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
      const tx = transaction ?? this.connection.newTransaction(true)
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
      throw new Error("Invalid depth. Should be between 1 and 10.")
    return Graph.Depths[depth]
  }

  /** Create an array of expansion phrases */
  static Depths: string[] = (() => {
    const nest = (s: string): string => `uid expand(_all_) { ${s} }`
    let expression = "uid expand(_all_)"
    const depths = []
    for (let i = 1; i < 11; i++) {
      depths[i] = expression
      expression = nest(expression)
    }
    return depths
  })()
}
