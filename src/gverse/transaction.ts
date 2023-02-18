import * as dgraph from "dgraph-js"
import { Connection } from "./connection"
import log from "./debug-logger"
import { v4 } from "uuid"
import { waitPromise, shouldRetry } from "./retry"

/** Represents a dgraph transaction that can be created on demand or explicitly. */
export class Transaction {
  private txn: dgraph.Txn
  private uuid: string = v4()
  private connection: Connection
  private autoCommit: boolean
  constructor(
    connection: Connection,
    autoCommit: boolean,
    verifyConnection = false,
    readOnly: boolean = false
  ) {
    if (verifyConnection && !connection?.verified) {
      const issue = "Can not create transaction. No verified connection."
      log(issue)
      throw Error(issue)
    }
    this.connection = connection
    this.autoCommit = autoCommit
    this.txn = connection.client.newTxn({ readOnly })
  }

  /** Commit the transaction and apply all operations. */
  async commit() {
    // todo check if transaction already committed
    await this.txn.commit()
    log(`Transaction ${this.uuid} committed`)
  }

  /** Discard all pending operations */
  async discard() {
    await this.txn.discard()
    log(`Transaction ${this.uuid} aborted`)
  }

  /** Returns object representation of the response JSON */
  async query(query: string, variables?: any, retries = 0): Promise<any> {
    log(
      `Transaction ${this.uuid} querying`,
      query,
      variables ? ` (variables: ${JSON.stringify(variables)})` : ""
    )
    try {
      const res = variables
        ? await this.txn.queryWithVars(query, variables)
        : await this.txn.query(query)
      log("Query response:", res.getJson())
      return res.getJson()
    } catch (e: any) {
      log(e)
      try {
        void this.txn.discard()
      } catch (e: any) {
        log(e)
      }
      if (shouldRetry(e, retries)) {
        this.txn = this.connection.client.newTxn({ readOnly: true })
        await waitPromise(`query ${query}`)
        return await this.query(query, variables, retries + 1)
      }
      log("Failed to query:", query, "; error:", e)
      throw Error(e)
    }
  }

  /** Mutate json-compliant object into graph space */
  async mutate(values: any, retries = 0): Promise<any> {
    log(`Transaction ${this.uuid} mutating`, JSON.stringify(values))
    try {
      if (!values.uid) {
        values.uid = "_:createdUid"
      }
      const mu = new dgraph.Mutation()
      mu.setCommitNow(this.autoCommit)
      mu.setSetJson(values)
      const uidMap = await this.txn.mutate(mu)
      const updatedUid = uidMap.getUidsMap().get("createdUid") ?? values.uid
      if (!updatedUid) {
        return values.uid
      }
      log(`Transaction ${this.uuid} mutated with new uid`, updatedUid)
      return updatedUid
    } catch (e: any) {
      log(e)
      try {
        void this.txn.discard()
      } catch (e: any) {
        log(e)
      }
      if (shouldRetry(e, retries)) {
        this.txn = this.connection.client.newTxn()
        await waitPromise(`mutate ${JSON.stringify(values)}`)
        return await this.mutate(values, retries + 1)
      }
      throw Error(e)
    }
  }

  /** Run an RDF mutation set a single predicate */
  async mutateNquads(
    subject: string,
    predicate: string,
    object: string
  ): Promise<string | undefined> {
    if (object === null) return
    const nquad = `${subject} <${predicate}> ${object} .`
    try {
      log(`Transaction ${this.uuid} mutating nquad: ${nquad}`)
      const mu = new dgraph.Mutation()
      mu.setCommitNow(this.autoCommit)
      mu.setSetNquads(nquad)
      const assigned = await this.txn.mutate(mu)
      return assigned.getUidsMap().get("blank-0")
    } catch (e: any) {
      log(`Transaction ${this.uuid} mutating failed`, nquad, e)
      void this.txn.discard()
      throw Error(e)
    }
  }

  /** Run an RDF mutation to delete a single predicate */
  async deleteNquads(
    subject: string,
    predicate: string,
    object: string
  ): Promise<string | undefined> {
    if (object === null) return
    const nquad = `${subject} <${predicate}> ${object} .`
    try {
      log(`Transaction ${this.uuid} deleting Nquad: ${nquad}`)
      const mu = new dgraph.Mutation()
      mu.setCommitNow(this.autoCommit)
      mu.setDelNquads(nquad)
      const assigned = await this.txn.mutate(mu)
      return assigned.getUidsMap().get("blank-0")
    } catch (e: any) {
      log(`Transaction ${this.uuid} delete nquad failed`, nquad, e)
      void this.txn.discard()
      throw Error(e)
    }
  }

  /** Delete vertices with given values. Values should be a list
   * of objects with uids or an object with uid.
   */
  async delete(values: any, retries = 0) {
    log(`Transaction ${this.uuid} deleting values`, values)
    if (!values.uid && values.length < 1) {
      log("Nothing to delete")
      return
    }
    try {
      const mu = new dgraph.Mutation()
      mu.setCommitNow(this.autoCommit)
      mu.setDeleteJson(values)
      const uid = await this.txn.mutate(mu)
      log(`Transaction ${this.uuid} deleted`, uid)
      return uid.getUidsMap().get("blank-0")
    } catch (e: any) {
      log(`Transaction ${this.uuid} delete failed`, values, e)
      try {
        void this.txn.discard()
      } catch (e: any) {
        log(e)
      }
      if (shouldRetry(e, retries)) {
        this.txn = this.connection.client.newTxn()
        await waitPromise(`delete ${JSON.stringify(values)}`)
        return await this.query(values, retries + 1)
      }
      log("Failed to delete:", values, "; error:", e)
      throw Error(e)
    }
  }

  /** Run upsert blocks in graph space */
  async upsert(
    query: string,
    values: any,
    condition?: string,
    retries = 0
  ): Promise<boolean> {
    log(
      `Transaction ${this.uuid} running upsert`,
      query,
      JSON.stringify(values),
      condition ?? ""
    )
    try {
      const mu = new dgraph.Mutation()
      mu.setSetJson(values)
      if (condition) mu.setCond(`@if(${condition})`)

      const req = new dgraph.Request()
      req.setQuery(`query ${query}`)
      req.setMutationsList([mu])
      req.setCommitNow(this.autoCommit)

      await this.txn.doRequest(req)
      return true
    } catch (e: any) {
      log(e)
      try {
        void this.txn.discard()
      } catch (e: any) {
        log(e)
      }
      if (shouldRetry(e, retries)) {
        this.txn = this.connection.client.newTxn()
        await waitPromise(`upsert`)
        return await this.upsert(query, values, condition, retries + 1)
      }
      throw Error(e)
    }
  }
}
