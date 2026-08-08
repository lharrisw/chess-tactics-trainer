/* Chess Tactics Trainer — Build 2.1.2
 * Comfortable responsive application layout.
 *
 * This is intentionally separate from Play-vs-Stockfish logic because it
 * improves every existing tab: Puzzle library, From your game, Play, Database.
 */
(function () {
  'use strict';

  const BUILD_ID = 'comfortable-layout-2.1.2';

  if (document.getElementById('ct-comfortable-layout-style')) return;

  const style = document.createElement('style');
  style.id = 'ct-comfortable-layout-style';
  style.textContent = `
    /*
     * DESKTOP / LAPTOP
     * The original panel was only 340px. Give the controls enough room to
     * breathe while preserving a large board and side-by-side workspace.
     */
    .wrap{
      max-width:1180px !important;
      gap:30px !important;
      padding:24px 22px 48px !important;
      flex-wrap:nowrap !important;
    }

    .board-col{
      flex:0 0 auto;
      min-width:0;
    }

    .panel{
      width:min(94vw,460px) !important;
      flex:0 1 460px;
      border-radius:12px !important;
    }

    /* Tabs retain natural widths. They scroll rather than collide. */
    .tabs{
      display:flex !important;
      flex-wrap:nowrap !important;
      overflow-x:auto !important;
      overflow-y:hidden !important;
      scrollbar-width:thin;
      scroll-behavior:smooth;
    }

    .tabs .tab{
      flex:0 0 auto !important;
      width:auto !important;
      min-width:max-content !important;
      white-space:nowrap !important;
      padding:14px 12px !important;
      line-height:1.2;
    }

    /* General panel spacing */
    .body{
      padding:20px !important;
      gap:16px !important;
    }

    .filters{
      gap:10px !important;
    }

    .filters select{
      flex:1 1 calc(50% - 5px) !important;
      min-width:180px;
    }

    select,
    textarea,
    input[type=file],
    input[type=number]{
      padding:10px 11px !important;
      font-size:.88rem !important;
      line-height:1.3;
    }

    textarea{
      min-height:104px !important;
    }

    .goal{
      padding:14px 16px !important;
      border-radius:9px !important;
    }

    .feedback{
      line-height:1.45;
    }

    .btns{
      gap:10px !important;
    }

    button.act{
      min-height:42px;
      padding:11px 12px !important;
      line-height:1.25;
    }

    .stats{
      gap:10px !important;
    }

    .stat{
      padding:10px 8px !important;
    }

    .movelist{
      padding:10px 12px !important;
      line-height:1.7 !important;
    }

    .note{
      font-size:.76rem !important;
      line-height:1.58 !important;
    }

    .db-card{
      padding:14px !important;
      gap:11px !important;
      border-radius:9px !important;
    }

    .db-row{
      gap:10px !important;
    }

    /*
     * PLAY TAB
     * Keep useful two-column grouping on roomy panels, with more separation.
     */
    #pane-play .play-summary{
      padding:14px 16px !important;
    }

    #pane-play .play-grid{
      gap:12px !important;
    }

    #pane-play .play-field{
      gap:6px !important;
    }

    #pane-play .play-options{
      gap:10px !important;
      margin-top:8px !important;
    }

    #pane-play .play-check{
      padding:10px !important;
      line-height:1.3;
    }

    #pane-play .play-thinking{
      min-height:20px !important;
    }

    #play-moves{
      max-height:220px !important;
    }

    .play-clock{
      padding:10px 13px !important;
      min-height:48px !important;
    }

    /*
     * POST-GAME STATE
     * Once Rematch/New settings are visible, stop using the active-game
     * control density. Give the result, moves, and meaningful next actions
     * their own relaxed layout.
     */
    #play-game:has(#play-after-buttons:not(.hidden)){
      display:flex;
      flex-direction:column;
      gap:14px;
    }

    #play-game:has(#play-after-buttons:not(.hidden)) .play-summary{
      padding:16px 18px !important;
      margin-bottom:0 !important;
    }

    #play-game:has(#play-after-buttons:not(.hidden)) #play-status{
      padding:13px 16px !important;
      margin:0 !important;
      font-size:.9rem !important;
      font-weight:800;
      line-height:1.45;
      border-radius:9px;
    }

    #play-game:has(#play-after-buttons:not(.hidden)) #play-thinking{
      display:none !important;
    }

    #play-game:has(#play-after-buttons:not(.hidden)) #play-moves{
      max-height:340px !important;
      min-height:230px;
      padding:14px 16px !important;
      margin:0 !important;
      font-size:.86rem;
      line-height:1.8 !important;
      border-radius:9px;
      overflow-y:auto;
    }

    #play-game:has(#play-after-buttons:not(.hidden)) #play-moves .move-pair{
      grid-template-columns:40px minmax(0,1fr) minmax(0,1fr) !important;
      gap:10px !important;
      padding:2px 0;
    }

    /*
     * Draw offer and resign have no purpose after the game is over.
     * Removing them makes room for the actions that still matter.
     */
    #play-game:has(#play-after-buttons:not(.hidden)) #play-draw,
    #play-game:has(#play-after-buttons:not(.hidden)) #play-resign{
      display:none !important;
    }

    /*
     * First post-game action group:
     *   Take back | Flip board
     *   Export PGN (full width)
     */
    #play-game:has(#play-after-buttons:not(.hidden)) > .btns:not(#play-after-buttons){
      display:grid !important;
      grid-template-columns:1fr 1fr !important;
      gap:10px !important;
      margin:0 !important;
    }

    #play-game:has(#play-after-buttons:not(.hidden)) #play-export{
      grid-column:1 / -1 !important;
      min-height:46px;
    }

    /*
     * Primary next-step actions get full-width rows. Rematch remains the
     * visual primary action; New settings is deliberately separate below it.
     */
    #play-game:has(#play-after-buttons:not(.hidden)) #play-after-buttons{
      display:grid !important;
      grid-template-columns:1fr !important;
      gap:10px !important;
      margin:0 !important;
    }

    #play-game:has(#play-after-buttons:not(.hidden)) #play-rematch,
    #play-game:has(#play-after-buttons:not(.hidden)) #play-new-settings{
      width:100%;
      min-height:48px;
    }

    /*
     * MEDIUM VIEWPORTS
     * Stack board and panel rather than squeezing either one.
     */
    @media (max-width:1080px){
      .wrap{
        flex-wrap:wrap !important;
        gap:22px !important;
      }

      .panel{
        width:min(94vw,560px) !important;
        flex:0 1 560px;
      }
    }

    /*
     * PHONE / NARROW WINDOW
     * One column is calmer than forcing pairs of tiny controls.
     */
    @media (max-width:620px){
      .topbar{
        padding:10px 12px !important;
        gap:8px !important;
      }

      .topbar h1{
        font-size:.98rem !important;
      }

      .topbar .mini{
        font-size:.7rem !important;
        white-space:nowrap;
      }

      .wrap{
        padding:14px 10px 32px !important;
        gap:18px !important;
      }

      .panel{
        width:min(96vw,560px) !important;
      }

      .body{
        padding:16px !important;
        gap:14px !important;
      }

      .tabs .tab{
        padding:13px 12px !important;
      }

      .filters select{
        flex:1 1 100% !important;
        min-width:0;
      }

      .btns{
        grid-template-columns:1fr !important;
      }

      button.act.wide{
        grid-column:auto !important;
      }

      #pane-play .play-grid{
        grid-template-columns:1fr !important;
      }

      #pane-play .play-field.wide{
        grid-column:auto !important;
      }

      #pane-play .play-options{
        grid-template-columns:1fr !important;
      }

      #sf-engine-card .sf-row{
        align-items:stretch !important;
      }

      #sf-engine-card .sf-row > *{
        flex:1 1 100% !important;
        width:100% !important;
      }
    }
  `;

  document.head.appendChild(style);

  window.TacticsLayout = {
    build: BUILD_ID,
    panelDesktopPx: 460,
    panelStackedMaxPx: 560,
    mobileSingleColumn: true,
    naturalWidthScrollableTabs: true,
    animationOptionsSpacingHotfix: true,
    postGameComfortLayout: true
  };

  console.info('[Tactics Trainer] Loaded ' + BUILD_ID);
}());
