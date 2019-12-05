import { Vertex } from "./vertex"

/** Gverse data types */
export enum Type {
  String,
  Int,
  Float,
  Boolean,
  ID,
  Date,
  DateTime,
  Geo
}

/** Gverse index types - based on Dgraph */
export enum Index {
  None,
  Int,
  Float,
  Boolean,
  Exact,
  Term,
  FullText,
  Hash,
  Trigram
}

/** Builds and holds schema definition for vertices, including data types,
 * index types and edges. Decorators apply to schema. */
export class Schema {
  master: any = {}

  setVertex(constructor: Function, { name }: { name: string }) {
    const schema = this.schemaFor(this.getName(constructor))
    schema["name"] = name || this.getName(constructor)
  }

  schemaFor(name: string) {
    if (!this.master[name])
      this.master[name] = { name, predicates: {}, edges: {} }
    return this.master[name]
  }

  getTypeName(vertexClass: typeof Vertex) {
    const schema = this.master[vertexClass.name]
    return (schema && schema.name) || vertexClass.name
  }

  setPredicate(
    target: any,
    key: string | symbol,
    type: Type,
    indices = [Index.None]
  ) {
    const name = this.getName(target.constructor)
    const vertexSchema = this.schemaFor(name)
    vertexSchema["predicates"][key] = {
      type,
      indices
    }
  }

  setEdge(target: any, key: string | symbol, to: typeof Vertex) {
    const name = this.getName(target.constructor)
    const vertexSchema = this.schemaFor(name)
    vertexSchema["edges"][key] = { to }
  }

  private getName(constructor: Function): string {
    return constructor.prototype.vertexName || constructor.name
  }

  getTypes() {
    return this.master
  }

  get(name: string) {
    return this.master[name]
  }

  getType(vertexClass: typeof Vertex) {
    return this.get(vertexClass.name)
  }

  getGqlType(vertexClass: typeof Vertex) {
    const schema = this.getType(vertexClass)
    const preds = Object.keys(schema.predicates).map((predicateName: any) => {
      const predicate = schema.predicates[predicateName]
      const index =
        predicate.index === Index[Index.None]
          ? ""
          : ` @index(${predicate.index})`
      return `  ${predicateName}: ${predicate.type}!${index}`
    })
    const edges = Object.keys(schema.edges).map((edgeName: any) => {
      const target = schema.edges[edgeName].to
      const targetType = this.getType(target)
      const targetName = (targetType && targetType.name) || target.name
      return `  ${edgeName}: ${targetName}`
    })
    return `
type ${schema.name} {
${preds.join("\n")}
${edges.join("\n")}
}
    `
  }
}

/** The master schema holds the definition for all vertices. */
export const MasterSchema = new Schema()
