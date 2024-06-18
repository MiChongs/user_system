
// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './index.vue'

// Composables
import { createApp } from 'vue'
import router from "@/router";

const app = createApp(App)

registerPlugins(app)

app.mount('#admin')
