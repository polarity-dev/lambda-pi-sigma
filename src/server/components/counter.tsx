type CounterProps = {
  counter: number 
}

function Counter({ counter }: CounterProps) {
  return(
    <button hx-get="/counter" hx-swap="outerHTML" class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded">
      {counter}
    </button>
  )
}

export default Counter
