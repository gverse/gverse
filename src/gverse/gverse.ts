import {
  Connection as _Connection,
  Environment as _Environment
} from "./connection"
import { Transaction as _Transaction } from "./transaction"
import { Graph as _Graph } from "./graph"
import { Vertex as _Vertex } from "./vertex"
import {
  Edge as _Edge,
  Cardinality as _Cardinality,
  Direction as _Direction
} from "./edge"

namespace Gverse {
  // --- Classes ---
  /** GRPC connection to the Dgraph server */
  export class Connection extends _Connection {}
  /** A Dgraph transaction */
  export class Transaction extends _Transaction {}
  /** Represents an active session with Dgraph */
  export class Graph extends _Graph {}
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
       return person.createInto(graph)
     }
   }
   ```
   */
  export class Vertex extends _Vertex {}
  /** Represents an edge that connect a vertex to one or more vertices.
   * Vertex class should contain _edges to define the edge properties.
   * E.g. ``` _edges = { father: Edge.toVertex(Father) } ```
   * @todo @future Support facets
   */
  export class Edge extends _Edge {}

  // --- Enums ---
  export import Cardinality = _Cardinality
  export import Direction = _Direction

  // --- Interfaces ---
  export type Environment = _Environment
}

export default Gverse
