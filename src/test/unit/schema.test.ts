import { Schema, Type, Index } from "../../gverse/schema"
import { Vertex } from "../../gverse/vertex"

// Fixture class that extends Vertex
class TestVertex extends Vertex {}

// Mock vertex for emulating invocation from decorator methods
const MockVertex: any = {
  constructor: { prototype: { vertexName: "MockVertex" } }
}

describe("Schema", () => {
  it("sets vertex", () => {
    const schema = new Schema()
    schema.setVertex(TestVertex, { name: "TestVertex" })
    const s = schema.get(TestVertex.name)
    expect(schema.getTypeName(TestVertex)).toBe(TestVertex.name)
    expect(s.name).toBe(TestVertex.name)
    expect(s.predicates).toEqual({})
    expect(s.edges).toEqual({})
  })
  it("sets predicates", () => {
    const schema = new Schema()
    schema.setPredicate(MockVertex, "name", Type.String, [Index.Exact])
    const s = schema.get("MockVertex")
    expect(s.predicates.name.type).toEqual(Type.String)
    expect(s.predicates.name.indices).toEqual([Index.Exact])
  })
  it("sets edges", () => {
    const schema = new Schema()
    schema.setEdge(MockVertex, "anEdge", TestVertex)
    const s = schema.get("MockVertex")
    expect(s.edges.anEdge).toEqual({ to: TestVertex })
  })
})
