import { Graph } from "./graph"
import { Edge, Cardinality, Direction } from "./edge"
import log from "./debug-logger"

/** Represents a vertex and connected edges and vertices.
   * Note: A vertex class must have an no-argument constructor
   * and default values for all property predicates.
   * E.g.
   * ```
   class Person extends Vertex {
     name: string = ""
     mother?: Person
     children?: Array<Person> = []
     _edges = {
       mother: Edge.toVertex(Person),
       children: Edge.toVertices(Person)
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
   * `_edges = { mother: Edge.toVertex(Person), children: Edge.toVertices(Person) }`
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
  async loadFrom(graph: Graph): Promise<any> {
    const updated = await graph.load(this)
    this._graph = graph
    return updated
  }

  /** Save the current state of the vertex to the graph.
   * @param traverse whether or not do marshal linked edges
   */
  async saveInto(graph: Graph, traverse = false): Promise<boolean> {
    this._graph = graph
    return !!(await graph.update(this, traverse))
  }

  /** Creates the given vertex to the graph.
   * @param traverse whether or not do marshal linked edges
   */
  async createInto(graph: Graph, traverse = false): Promise<any> {
    this._graph = graph
    return await graph.create(this, traverse)
  }

  /** Deletes the given vertex from the graph.
   * @param traverse whether or not do marshal linked edges
   */
  async deleteFrom(graph: Graph, traverse = false): Promise<any> {
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
                if (predicate instanceof Vertex) predicate = predicate.marshal()
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
