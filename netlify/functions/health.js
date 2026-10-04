import apiHandler from '../../api/health.js'; import {adapt} from './adapter.js'; export async function handler(event){return adapt(apiHandler,event)}
