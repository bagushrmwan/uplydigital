import apiHandler from '../../api/product-image.js'; import {adapt} from './adapter.js'; export async function handler(event){return adapt(apiHandler,event)}
