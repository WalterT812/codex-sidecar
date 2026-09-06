export const timerDesign=`
.timer-badge{z-index:2147483640}
.timer-current{background:transparent;border:0;padding:0 0 18px;border-bottom:1px solid #e4dbe8;border-radius:0}
.timer-title{font-size:20px;font-weight:600}.timer-kicker{font-size:11px;margin-bottom:6px}
.timer-dial{position:relative;width:min(100%,270px);aspect-ratio:1;margin:14px auto 18px;display:flex;flex-direction:column;justify-content:center;align-items:center}
.timer-ring{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.timer-dial-label{color:#75637e;font-size:12px}.timer-clock{font:600 58px/1.2 var(--sidecar-font,"HarmonyOS Sans SC","Segoe UI",sans-serif);font-variant-numeric:tabular-nums;letter-spacing:-1px;margin:10px 0 0;color:#493057}
.timer-progress{position:absolute;width:1px;height:1px;clip-path:inset(50%)}
.timer-controls{gap:16px;margin:0}.timer-controls .button{min-width:100px;border-radius:24px;padding:10px 18px}.timer-controls .button:first-child{background:#493057;color:#fffdfa;border-color:#493057}
.timer-current>.timer-help{font-size:11px}.timer-heading{font-size:13px}.timer-plan{gap:8px}
.timer-row{position:relative;padding:10px 8px;gap:9px;border-radius:14px}.timer-row-copy strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timer-row-copy small{font-size:11px}
.timer-order{font-size:12px;color:#75637e;font-variant-numeric:tabular-nums}.timer-grip{cursor:grab;touch-action:none;flex:none;color:#836b91;width:26px;height:32px;padding:5px!important;background:transparent;border:0}.timer-grip:active{cursor:grabbing}.timer-row .timer-remove{flex:none;background:transparent;border:0;width:28px;height:30px;padding:5px}.timer-row .timer-remove .icon{width:16px;height:16px}.timer-row[data-dragging=true]{opacity:.48}.timer-row[data-drop=true]{border-color:#9874aa;background:#f2eaf7;box-shadow:0 -2px #b69b67}
.timer-add-toggle{width:100%;padding:13px;border:1px dashed #cfc0d8;border-radius:14px;background:transparent;color:#493057}.timer-add-toggle:hover{background:#f1ebf5}.timer-form{padding:14px;background:#f5f0f8;border:1px solid #e0d5e7;border-radius:16px}
@media(forced-colors:active){.timer-ring{display:none}.timer-progress{position:static;clip-path:none;width:90%;height:8px}}
`;
