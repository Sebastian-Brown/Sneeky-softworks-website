// Application bootstrap entry point: wires the ramen-stall scene and the
// day/night slider into #app. Nothing else bootstrates itself.

import './styles.css'
import { createRamenScene } from './scene/ramenScene'
import { createDayNightSlider } from './components/dayNightSlider'

const app = document.getElementById('app')
if (app === null) throw new Error('Missing #app container')

const scene = createRamenScene(app)
const slider = createDayNightSlider(1, (t) => scene.setDayNight(t))
app.appendChild(slider.element)
