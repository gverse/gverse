# Gverse - Object Graph Mapper for Dgraph

Gverse is an Object Graph Mapper (OGM) for the [Dgraph](dgraph.io) open-source [Graph Database](https://en.wikipedia.org/wiki/Graph_database).

#### What's an OGM?

An OGM enables developers to work with their graph models through idiomatic objects provided by their native programming language. It is similar in concept to Object-Relational Mapping (ORM) libraries such as [TypeORM](typeorm.io), [Sequelize](http://docs.sequelizejs.com/) or [Hibernate](https://hibernate.org/) but with some fundamental differences ([see below](#gverse-vs-traditional-orms)).

### Getting Started

Here's a quick start guide to get you up and running.

#### Install Dgraph

Make sure you have [Dgraph installed and running](https://docs.dgraph.io/get-started). This guide assumes you have Dgraph running on default port (9080).

#### Set up your ES6 or TypeScript environment

Gverse requires ES6 with class properties plugin or TypeScript ≥ 2.0. TypeScript 3.4 or higher is recommended.

- Configure [Babel](https://babel.org) (see [quick start guide](https://www.robinwieruch.de/minimal-node-js-babel-setup/)) and add the [Class Properties Plugin](https://babeljs.io/docs/en/babel-plugin-proposal-class-properties)

or

- Use [TypeScript](https://www.typescriptlang.org/docs/tutorial.html) (see [getting started guide](https://levelup.gitconnected.com/typescript-quick-start-guide-7257c2b71538))

#### Install Gverse package

```sh
npm install gverse
```

or if you prefer, `yarn add gverse`. The package includes TypeScript types.

#### Create a Gverse graph object

```typescript
import Gverse from "gverse"

const graph = new Gverse.Graph(
  new Gverse.Connection({ host: "localhost", port: 9080 })
)
```

#### Define a Gverse.Vertex class

```typescript
class User extends Gverse.Vertex {
  type = "User"
  name: string = ""
}
```

#### Create the vertex on the graph

```typescript
const user = new User()
user.name = "Zak"
await graph.create(user)
```

#### Load a vertex from the graph

```typescript
const user = (await graph.get(uid)) as User
console.log(user.name) // = "Zak"
```

For detailed examples, please see the integration tests under `./test/integration`.

#### Defining edges (links to other vertices)

```typescript
class Repo {
  type: "Repository"
  name: string
  owner: User
  contributors: User[]
  _edges: {
    owner: Edge.toVertex(User),
    contributors: Edge.toVertices(User)
  }
}
```

Edges can be directed or undirected (reversible), and can have a cardinality of one or many.

For detailed examples, please see the integration tests under `./test/integration`.

### Running Tests

Test coverage for Gverse comes from integration tests. [Docker](https://docs.docker.com/install/) and [Docker-Compose](https://docs.docker.com/compose/install/) are required for running integration tests.

```sh
./run-integration-tests.sh
```

To run the unit tests (under development):

```sh
npm run test
```

#### Gverse features

Supported now:

- Simple API for working with graphs
- Strongly typed classes and predicates (instance variables) when using TypeScript
- Automatically marshal and unmarshal JavaScript objects to and from Graph vertices
- Support for custom marshaling and unmarshaling methods
- Support for directed and undirected edges
- Support for transactions and batch updates
- Before and after hooks for create, update and delete operations
- Query options

Roadmap:

- Decorators for object-to-graph mapping (v1.1)
- Support for Dgraph 1.1 Types

#### Gverse vs Traditional ORMs

Gverse has some fundamental differences to popular ORMs. It's helpful to understand the key differences to avoid confusion:

- Gverse works with vertices and edges in a Graph structure instead of tables, columns and rows in RDBMS like MySQL, Postgres, Oracle, or documents in MongoDB, CouchDB, etc. ([learn more](https://docs.dgraph.io/query-language/)).
- Gverse schema supports dynamic typing. You do not need to define and migrate schemas. Predicates (attributes) can be added as needed, with their data types inferred by value.
- A schema definition is required for any type that is part of a [query or filter function](https://docs.dgraph.io/query-language/#schema). Both the type and the index needs to be defined and applied. .
- Advanced graph queries in Gverse are written using GraphQL± (a variant of [GraphQL](graphql.org)).
