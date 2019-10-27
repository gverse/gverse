import { Connection as _Connection } from "./connection"
import { Transaction as _Transaction } from "./transaction"

namespace Gverse {
  export class Connection extends _Connection {}
  export class Transaction extends _Transaction {}
}

export default Gverse
