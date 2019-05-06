/** Mock Universe graph */
export const graph: any = {}
graph.create = jest.fn((vertex: any) => {})
graph.first = jest.fn((vertex: any, args: any) => {})

/** Get the first passed argument to a mock function */
export function firstArg(mockFunction: any): any {
  return mockFunction.mock.calls[0][0]
}

/** Get the second passed argument to a mock function */
export function secondArg(mockFunction: any): any {
  return mockFunction.mock.calls[0][1]
}
