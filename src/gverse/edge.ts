import { Vertex } from "./vertex"

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
    return Edge.buildEdge(type, Cardinality.Single, { reverseOf })
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
    return Edge.buildEdge(type, Cardinality.Multiple, { reverseOf })
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
