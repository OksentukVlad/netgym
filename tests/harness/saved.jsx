// For tests/saved.test.mjs: the saved-progress adapter with the NetGym target
// (its sections' `saved` tables and URL codecs), and what real instances are
// built from: every exercise's logic, as its screen calls it.
export { default as target } from '../../src/targets/netgym.js';
export { bootOf } from '../../src/app/Shell.jsx';
export { CAP, DEBOUNCE_MS, GEN_KEY, KEY, MAX_DONE, MAX_READ, OLD_KEYS, VERSION, createSaver, fitted, readSaved, redactorOf, restoreSaved } from '../../src/app/saved.js';
export { checkTyped } from '../../src/sections/setup/logic/typed.js';
export { initialStore, storeReducer } from '../../src/app/store.js';
export { initialInstance, instanceReducer } from '../../src/ui/exercise-state.js';
export { instanceKeyOf } from '../../src/ui/useExercise.js';
export { sidesExercise } from '../../src/sections/dhcp/screens/SidesView.jsx';
export { serverExercise } from '../../src/sections/dhcp/screens/ServerView.jsx';
export { natRound, natRules } from '../../src/sections/dhcp/screens/NatView.jsx';
export { faultExercise } from '../../src/sections/dhcp/screens/FaultView.jsx';
export { proofExercise } from '../../src/sections/checks/screens/ProofView.jsx';
export { ladderExercise } from '../../src/sections/checks/screens/LadderView.jsx';
export { claimsExercise } from '../../src/sections/checks/screens/ClaimsView.jsx';
export { default as maskLogic } from '../../src/sections/ip/logic/mask.js';
export { default as binaryLogic } from '../../src/sections/ip/logic/binary.js';
export { default as fwLogic } from '../../src/sections/firewall/logic/predict.js';
export { forRecord as orderLogic } from '../../src/sections/firewall/logic/order.js';
export { initialState as orderInitial, transition as orderTransition } from '../../src/sections/firewall/logic/order-state.js';
export { recordsOf as firewallRecords } from '../../src/sections/firewall/screens/url.js';
export { default as vlanPredict } from '../../src/sections/vlan/logic/predict.js';
export { default as vlanPorts } from '../../src/sections/vlan/logic/ports.js';
export { default as vlanRoute } from '../../src/sections/vlan/logic/route.js';
export { default as vlanFaults } from '../../src/sections/vlan/logic/faults-exercise.js';
export { blankForm } from '../../src/sections/vlan/screens/portsState.js';
export { default as routingLogic } from '../../src/sections/routing/logic/static.js';
export { default as routingFaults } from '../../src/sections/routing/logic/faults-exercise.js';
export { initialState as routingFaultState, submit as routingFaultSubmit } from '../../src/sections/routing/logic/faults-state.js';
export { default as drillLogic } from '../../src/sections/setup/logic/deck.js';
export { initialState as drillInitial, transition as drillTransition } from '../../src/sections/setup/logic/state.js';
