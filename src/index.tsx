import { Hono } from 'hono'
import { renderer } from './renderer'

const app = new Hono()

app.use(renderer)

app.get('/', (c) => {
  return c.render(
    <div id="root"></div>,
    { script: '/static/client.js' }
  )
})

export default app
