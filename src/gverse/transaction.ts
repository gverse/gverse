import * as dgraph from "dgraph-js"
import { Connection } from "./connection"
import log from "./debug-logger"
import uuidv4 from "uuid/v4"
import { waitPromise, shouldRetry } from "./retry"

/** Represents a dgraph transaction that can be created on demand or explicitly. */
export class Transaction {
  private txn: dgraph.Txn
  private uuid: string = uuidv4()
  constructor(
    readonly connection: Connection,
    readonly autoCommit: boolean,
    verifyConnection = false,
    private readOnly: boolean = false
  ) {
    if (verifyConnection && (!connection || !connection.verified)) {
      const issue = "Can not create transaction. No verified connection."
      log(issue)
      throw Error(issue)
    }
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
    } catch (e) {
      log(e)
      try {
        this.txn.discard()
      } catch (e) {
        log(e)
      }
      if (shouldRetry(e, retries)) {
        this.txn = this.connection.client.newTxn({ readOnly: true })
        await waitPromise(`query ${query}`)
        return await this.query(query, variables, retries + 1)
      } else {
        log("Failed to query:", query, "; error:", e)
        throw Error(e)
      }
    }
  }

  /** Mutate json-compliant object into graph space */
  async mutate(values: any, retries = 0): Promise<any> {
    log(`Transaction ${this.uuid} mutating`, JSON.stringify(values))
    try {
      const mu = new dgraph.Mutation()
      mu.setCommitNow(this.autoCommit)
      mu.setSetJson(values)
      const uidMap = await this.txn.mutate(mu)
      const updatedUid = uidMap.getUidsMap().get("blank-0") || values.uid
      if (!updatedUid) {
        return values.uid
      }
      log(`Transaction ${this.uuid} mutated with new uid`, updatedUid)
      return updatedUid
    } catch (e) {
      log(e)
      try {
        this.txn.discard()
      } catch (e) {
        log(e)
      }
      if (shouldRetry(e, retries)) {
        this.txn = this.connection.client.newTxn()
        await waitPromise(`mutate ${JSON.stringify(values)}`)
        return await this.mutate(values, retries + 1)
      } else {
        throw Error(e)
      }
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
    } catch (e) {
      log(`Transaction ${this.uuid} mutating failed`, nquad, e)
      this.txn.discard()
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
    } catch (e) {
      log(`Transaction ${this.uuid} delete nquad failed`, nquad, e)
      this.txn.discard()
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
    } catch (e) {
      log(`Transaction ${this.uuid} delete failed`, values, e)
      try {
        this.txn.discard()
      } catch (e) {
        log(e)
      }
      if (shouldRetry(e, retries)) {
        this.txn = this.connection.client.newTxn()
        await waitPromise(`delete ${JSON.stringify(values)}`)
        return await this.query(values, retries + 1)
      } else {
        log("Failed to delete:", values, "; error:", e)
        throw Error(e)
      }
    }
  }
}
