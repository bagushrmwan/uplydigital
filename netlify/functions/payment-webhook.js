import apiHandler from '../../api/payment-webhook.js'; import {adapt} from './adapter.js'; export async function handler(event){return adapt(apiHandler,event)}
