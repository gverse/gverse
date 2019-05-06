# Gverse - Object Graph Mapper for Dgraph

Gverse is an Object Graph Mapper (OGM) for the [Dgraph](dgraph.io) open-source [Graph Database](https://en.wikipedia.org/wiki/Graph_database).

#### What's an OGM?

An OGM enables developers to work with their graph models through idiomatic objects provided by their native programming language. It is similar in concept to Object-Relational Mapping (ORM) libraries such as [TypeORM](typeorm.io), [Sequelize](http://docs.sequelizejs.com/) or [Hibernate](https://hibernate.org/) but with some fundamental differences ([see below](#gverse-vs-traditional-orms)).

### Getting Started

Here's a quick start guide to get you up and running.

##### Install Dgraph

Make sure you [Dgraph installed and running](https://docs.dgraph.io/get-started). This guide assumes you have Dgraph running on default port (9080).

##### Install Gverse package

```sh
npm install gverse
```

or if you prefer, `yarn add gverse`. The package includes TypeScript types.

##### Create a Gverse graph object

```typescript
import Gverse from "gverse"

const graph = new Gverse.Graph(
  new Gverse.Connection({ host: "localhost", port: 9999 })
)
```

##### Define a vertex class

```typescript
class Person extends Gverse.Vertex {
  type = "Person" // type name
  name: string = ""
}
```

##### Persist and load a vertex instance

```typescript
const person = new Person()
person.name = "Zak"
// save and get the auto-generated universal id
const uid = await graph.create(person)
```

##### Load a vertex from the graph

```typescript
const zak = (await graph.get(uid)) as Person
console.log(zak.name) // = "Zak"
```

For detailed examples, please see the integration tests under `./test/integration`.

### Running Tests

To run the unit tests (under development):

```sh
npm run test
```

For integration tests, start the local dgraph first and then run the tests:

```sh
./scripts/test_dgraph.sh
npm run integration
```

#### Gverse vs Traditional ORMs

Gverse has some fundamental differences to popular ORMs. It's helpful to understand the key differences to avoid confusion:

- Gverse works with vertices and edges in a Graph structure instead of tables, columns and rows in RDBMS like MySQL, Postgres, Oracle, or documents in MongoDB, CouchDB, etc. ([learn more](https://docs.dgraph.io/query-language/)).
- Gverse schema supports dynamic typing. New predicates (attributes can be added dynamically and the data types are inferred. You do not need to define and migrate schemas.
- A schema definition is required for any type that is part of a [query or filter function](https://docs.dgraph.io/query-language/#schema). Both the type and the index needs to be defined and applied. .
- Advanced graph queries in Gverse are written using GraphQL± (a variant of [GraphQL](graphql.org)).
