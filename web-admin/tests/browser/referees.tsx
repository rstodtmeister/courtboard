import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GamesEditor } from '../../src/admin/GamesEditor';
import type { Game } from '../../src/types';
import '../../src/styles.css';
const makeGame = (number: string, a: string, b: string, referee: string): Game => ({ id:number, number, tournament_id:'test', round:'A', team_a:a, team_b:b, referee, court:'1', completed:false, game_rating:'Normal' } as Game);
function Harness() {
 const [games,setGames]=useState([makeGame('1','Team A','Team B','HVV Schiedsgericht'),makeGame('2','Team A','Team C','')]);
 const [saves,setSaves]=useState(0);
 return <><output data-testid="saves">{saves}</output><GamesEditor games={games} tournament={null} printing="" onSave={async(game,draft)=>{setSaves(n=>n+1);setGames(current=>current.map(item=>item.id===game.id?{...item,...draft}:item));return true}} onReorder={async()=>true} onUnlockGame={async()=>{}} onPrintPdf={async()=>{}} /></>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
