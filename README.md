# Gverse

#### Object Graph Mapper for Dgraph

![GitHub](https://img.shields.io/github/license/gverse/gverse) ![CircleCI](https://img.shields.io/circleci/build/github/gverse/gverse) ![npm type definitions](https://img.shields.io/npm/types/gverse) ![GitHub package.json version](https://img.shields.io/github/package-json/v/gverse/gverse)

Gverse is an Object Graph Mapper (OGM) for the [Dgraph](dgraph.io), the high-performance open-source [Graph Database](https://en.wikipedia.org/wiki/Graph_database). Gverse is written in TypeScript and supports TypeScript 3 and JavaScript ES6.

#### What's an OGM?

An OGM enables developers to work with their graph models through idiomatic objects provided by their native programming language. It is similar in concept to Object-Relational Mapping (ORM) libraries such as [TypeORM](typeorm.io), [Sequelize](http://docs.sequelizejs.com/) or [Hibernate](https://hibernate.org/) but with some fundamental differences ([see below](#gverse-vs-traditional-orms)).

#### Features

- Simple API for working with graphs vertices (nodes) and edges (links)
- Strongly typed classes and predicates (attributes) when using TypeScript
- Automatically marshal and unmarshal JavaScript objects to and from Graph vertices
- Support for custom marshaling and unmarshaling methods
- Support for directed and undirected edges
- Support for transactions and batch updates
- Before and after hooks for create, update and delete operations
- Query options for ordering and pagination
- Support for Dgraph 1.1 Types

Roadmap:

- Decorators for object-to-graph mapping (v1.1)

##### Compatibility with Dgraph

Gverse supports Dgraph version 1.2.x. Work is underway for supporting the new [Features in Dgraph 20.03](https://dgraph.io/blog/post/dgraph-graphql-hits-ga/).

For earlier versions of Dgraph, Gverse version 1.0.x can be used.

### Getting started

Here's a quick start guide to get you up and running.

#### Install Dgraph

Make sure you have [Dgraph installed and running](https://docs.dgraph.io/get-started). This guide assumes you have Dgraph running on default ports (8080 for HTTP and 9080 gRPC).

#### Set up your TypeScript or JavaScript ES6 environments

Gverse requires ES6 with class properties plugin or TypeScript ≥ 2.0.

- Configure your project for [TypeScript](https://www.typescriptlang.org/docs/tutorial.html) (see [getting started guide](https://levelup.gitconnected.com/typescript-quick-start-guide-7257c2b71538)),
  – or –
- Configure [Babel](https://babel.org) (see [quick start guide](https://www.robinwieruch.de/minimal-node-js-babel-setup/)) and add the [Class Properties Plugin](https://babeljs.io/docs/en/babel-plugin-proposal-class-properties).

#### Install the Gverse package

```sh
npm install gverse
```

or if you prefer, `yarn add gverse`. The package includes TypeScript types.

#### Create a Gverse graph session

```typescript
import Gverse from "gverse"

const graph = new Gverse.Graph(
  new Gverse.Connection({ host: "localhost", port: 9080 })
)
```

#### Define a vertex class

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

Edges can be directed or undirected (reversible), and can have a cardinality of one or many. For detailed examples, please see the integration tests under `./test/integration`.

### Running Tests

Test coverage for Gverse comes from integration tests. [Docker](https://docs.docker.com/install/) and [Docker-Compose](https://docs.docker.com/compose/install/) are required for running integration tests.

```sh
./run-integration-tests.sh
```

#### Gverse OGM vs Traditional ORMs

Gverse has some fundamental differences to popular ORMs. It's helpful to understand the key differences:

- Gverse works with vertices and edges in a Graph structure instead of tables, columns and rows in RDBMS like MySQL, Postgres, Oracle, or documents in MongoDB, CouchDB, etc. ([learn more](https://docs.dgraph.io/query-language/)).
- Gverse schema supports dynamic typing. You do not need to define and migrate schemas. Predicates (attributes) can be added as needed, with their data types inferred by value.
- A schema definition is required for any type that is part of a [query or filter function](https://docs.dgraph.io/query-language/#schema). Both the type and the index needs to be defined and applied. .
- Advanced graph queries in Gverse are written using GraphQL± (a variant of [GraphQL](graphql.org)).
