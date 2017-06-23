# babel-plugin-redux-state-compose [![Build Status](https://travis-ci.org/akameco/babel-plugin-redux-state-compose.svg?branch=master)](https://travis-ci.org/akameco/babel-plugin-redux-state-compose)

> compose redux State type


## Install

```
$ npm install babel-plugin-redux-state-compose
```


## Usage

### In

```js
// @flow
import type { State as HogeState } from './Hoge/reducer'

export type State = {
  hoge: HogeState,
}
```

App/reducer.js
```js
// @flow
export type State = { app: string }

export const initialState: State = { app: 'app' }
```

### Out

```js
// @flow
import type { State as HogeState } from './Hoge/reducer';

import type { State as AppState } from './App/reducer';

export type State = {
  hoge: HogeState;
  app: AppState;
};
```

### babalrc

```
{
  "plugins": [["redux-store-compose", {input: 'App/reducer.js'}]]
}
```

## License

MIT © [akameco](http://akameco.github.io)
