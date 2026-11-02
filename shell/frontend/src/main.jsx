// First: polyfills for older browsers, before any app module runs.
import '@compat'
import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
// The target's root: the app itself for single-tool builds, the shell for NetGym.
import {Root} from '@target'

const container = document.getElementById('root')

const root = createRoot(container)

root.render(
    <React.StrictMode>
        <Root/>
    </React.StrictMode>
)
