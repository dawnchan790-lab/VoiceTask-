// This file is intentionally empty
// VoiceTask is deployed as a static SPA without server-side functions
// All routing is handled client-side by React Router

export default {
  fetch() {
    return new Response('Not used', { status: 404 })
  }
}
