
import { getPlatformSupport } from '@microsoft/mxc-sdk/v1';

const support = getPlatformSupport();

console.log(JSON.stringify(support, null, 2));
