import { Type, Index, Schema } from "./schema"

/** Translates Gverse schema definition to Dgraph v1.1+ type system. */
export class DgraphSchema {
  constructor(private schema: Schema) {}

  /** Get Dgraph type and index definition as strings */
  getSchema() {
    const { types, indices } = this.translate()
    return {
      types: types.join("\n"),
      indices: indices.join("\n")
    }
  }

  private getDgraphType(predicate: any) {
    return DgraphType[Type[predicate.type]]
  }

  private getIndexTerms(predicate: any) {
    return predicate.indices
      .filter((i: Index) => i !== Index.None)
      .map((index: Index) => DgraphIndex[Index[index]])
  }

  /// Translate gverse schema to dgraph types and indices
  private translate() {
    const types: string[] = []
    const indexMap: any = {}
    const dataTypes: any = {}
    for (const vertexName in this.schema.getTypes()) {
      const vertex = this.schema.get(vertexName)
      types.push(`type ${vertex.name} {`)
      for (const predicateName in vertex.predicates) {
        const predicate = vertex.predicates[predicateName]
        const dgraphType = this.getDgraphType(predicate)
        const previousType = dataTypes[predicateName]
        // Make sure we don't have a type conflict
        if (previousType && previousType !== dgraphType)
          throw TypeError(
            `${predicateName} has conflicting types: ${previousType} and ${dgraphType}`
          )
        dataTypes[predicateName] = dgraphType
        types.push(`  ${predicateName}: ${DgraphType[Type[predicate.type]]}`)
        if (predicate.indices !== [Index.None]) {
          indexMap[predicateName] = (indexMap[predicateName] || []).concat(
            this.getIndexTerms(predicate)
          )
        }
      }
      types.push("}")
    }
    const indices = Object.keys(indexMap).map(
      (name: string) =>
        `<${name}>: ${dataTypes[name]} @index(${indexMap[name]}) .`
    )
    return { types, indices }
  }
}

const DgraphType: {
  [name: string]: string
} = {
  String: "string",
  Int: "int",
  Float: "float",
  Boolean: "bool",
  ID: "id",
  Date: "dateTime",
  DateTime: "dateTime",
  Geo: "geo"
}

const DgraphIndex: {
  [name: string]: string
} = {
  Int: "int",
  Float: "float",
  Boolean: "bool",
  Exact: "exact",
  Term: "term",
  FullText: "fulltext",
  Hash: "hash",
  Trigram: "trigram"
}
