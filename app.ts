import { Component, signal, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { jsPDF } from 'jspdf';

Chart.register(...registerables);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent implements OnInit {
  protected readonly title = signal('curvaVoto');

  scuole = [
    { 
      id: 'elementari', 
      nome: 'Scuola Elementare', 
      materie: ['Italiano', 'Inglese', 'Matematica', 'Storia', 'Geografia','Arte', 'Musica', 'Religione', 'Ed. Fisica'] 
    },
    { 
      id: 'medie', 
      nome: 'Scuola Media', 
      materie: ['Italiano', 'Storia', 'Geografia', 'Matematica', 'Scienze', 'Inglese', '2° Lingua', 'Tecnologia', 'Arte', 'Musica', 'Ed. Fisica'] 
    },
    { 
      id: 'superiori', 
      nome: 'Scuola Superiore', 
      materie: ['Italiano', 'Geostoria', 'Matematica', 'Chimica', 'Fisica', 'Inglese', 'Informatica', 'Ed. Fisica'] 
    }
  ];

  scuolaSelezionata = this.scuole[0];
  materieAttuali: string[] = this.scuolaSelezionata.materie;
  nuovaMateria: string = this.materieAttuali[0];
  nuovoPunteggio: number = 0;
  
  voti: { materia: string, punteggio: number }[] = [];
  chart: any;
  vobotResponso: string = 'Inizia inserendo i voti o caricando un file!';
  
  // Flag per il blocco mutuo: 'nessuno', 'manuale', 'file'
  metodoInserimento: string = 'nessuno';

  @ViewChild('curvaDiImpresa') graficoCanvas!: ElementRef;

  OnInit(): void {
    console.log("Sistema pronto.");
  }

  private sanitize(str: string): string {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  cambiaScuola(event: any) {
    const idScuola = event.target.value;
    const scuola = this.scuole.find(s => s.id === idScuola);
    if (scuola) {
      this.scuolaSelezionata = scuola;
      this.materieAttuali = scuola.materie;
      this.nuovaMateria = this.materieAttuali[0];
    }
  }

  aggiungiVoto() {
    if (this.metodoInserimento === 'file') {
      alert('Hai già caricato un file. Svuota il registro per inserire voti manualmente.');
      return;
    }

    if (this.nuovoPunteggio >= 2 && this.nuovoPunteggio <= 10) {
      this.voti.push({ materia: this.nuovaMateria, punteggio: this.nuovoPunteggio });
      this.metodoInserimento = 'manuale';
      this.nuovoPunteggio = 0;
      this.aggiornaGrafico();
      this.eseguiAnalisiVobot();
    } else {
      alert('Inserisci un voto valido tra 2 e 10');
    }
  }

  onFileSelected(event: any) {
    if (this.metodoInserimento === 'manuale') {
      alert('Hai già inserito voti manualmente. Svuota il registro per importare un file.');
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => this.elaboraCSV(e.target.result);
    reader.readAsText(file);
  }

  elaboraCSV(testo: string) {
    const righe = testo.split('\n');
    const nuoviVoti: { materia: string, punteggio: number }[] = [];

    righe.forEach((riga, index) => {
      if (index === 0 && riga.toLowerCase().includes('materia')) return;
      const colonne = riga.split(/[;,]/);
      if (colonne.length >= 2) {
        const materia = colonne[0].trim();
        let votoPulito = colonne[1].trim().replace(',', '.');
        const punteggio = parseFloat(votoPulito);
        if (materia && !isNaN(punteggio)) {
          nuoviVoti.push({ materia, punteggio });
        }
      }
    });

    if (nuoviVoti.length > 0) {
      this.voti = nuoviVoti;
      this.metodoInserimento = 'file';
      this.aggiornaGrafico();
      this.eseguiAnalisiVobot();
      alert(`Importati correttamente ${nuoviVoti.length} voti!`);
    }
  }

  eseguiAnalisiVobot() {
    if (this.voti.length === 0) {
      this.vobotResponso = 'Nessun voto presente.';
      return;
    }

    const datiPerMateria: { [key: string]: number[] } = {};
    this.voti.forEach(v => {
      if (!datiPerMateria[v.materia]) datiPerMateria[v.materia] = [];
      datiPerMateria[v.materia].push(v.punteggio);
    });

    let materiaCritica = '';
    let mediaMinima = 11;
    let trendAlert: string[] = [];

    for (let m in datiPerMateria) {
      const vMateria = datiPerMateria[m];
      const media = vMateria.reduce((a, b) => a + b, 0) / vMateria.length;
      if (media < mediaMinima) { mediaMinima = media; materiaCritica = m; }
      if (vMateria.length >= 2 && vMateria[vMateria.length - 1] < vMateria[vMateria.length - 2]) {
        trendAlert.push(m);
      }
    }

    let msg = mediaMinima < 6 
      ? `🆘 Urgente: recupera ${materiaCritica} (media: ${mediaMinima.toFixed(1)}). `
      : `✅ Media più bassa: ${materiaCritica} (${mediaMinima.toFixed(1)}). `;
    
    if (trendAlert.length > 0) msg += `📉 Calo in: ${trendAlert.join(', ')}.`;
    this.vobotResponso = msg;
  }

  resettaTutto() {
    this.voti = [];
    this.metodoInserimento = 'nessuno';
    this.vobotResponso = 'Registro svuotato.';
    if (this.chart) this.chart.destroy();
  }

  aggiornaGrafico() {
    if (!this.graficoCanvas) return;
    const matConVoti = [...new Set(this.voti.map(v => v.materia))];
    let maxProve = 0;
    matConVoti.forEach(m => {
      const c = this.voti.filter(v => v.materia === m).length;
      if (c > maxProve) maxProve = c;
    });

    const datasets = matConVoti.map((materia, index) => {
      const colore = `hsl(${index * 60}, 70%, 50%)`;
      return {
        label: materia,
        data: this.voti.filter(v => v.materia === materia).map(v => v.punteggio),
        borderColor: colore, backgroundColor: colore, tension: 0.3
      };
    });

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(this.graficoCanvas.nativeElement, {
      type: 'line',
      data: {
        labels: Array.from({ length: maxProve || 1 }, (_, i) => `${i + 1}° Voto`),
        datasets: datasets
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 35 } },
        plugins: { legend: { position: 'top', labels: { padding: 20 } } },
        scales: { y: { min: 2, max: 11, ticks: { stepSize: 1 } } }
      }
    });
  }

  scaricaPDF() {
  if (!this.graficoCanvas) return;

  const canvas = this.graficoCanvas.nativeElement;
  
  // 1. TRUCCO PER L'ALTA DEFINIZIONE
  // Creiamo un'immagine ad altissima densità (4x)
  const imgData = canvas.toDataURL('image/png', 1.0); 

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  
  // 2. DESIGN DEL REPORT
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(44, 62, 80);
  pdf.text("Report Andamento Voti Scolastici", 15, 20);

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(120, 120, 120);

  // Linea di separazione elegante
  pdf.setDrawColor(52, 152, 219);
  pdf.setLineWidth(0.8);
  pdf.line(15, 32, pdfWidth - 15, 32);

  // 3. INSERIMENTO GRAFICO
  // Calcolo dimensioni per occupare bene il foglio A4
  const margin = 15;
  const displayWidth = pdfWidth - (margin * 2);
  const displayHeight = (canvas.height * displayWidth) / canvas.width;

  // Inseriamo l'immagine con alias impostato a 'FAST' o 'SLOW' per migliorare i bordi
  pdf.addImage(imgData, 'PNG', margin, 45, displayWidth, displayHeight, undefined, 'SLOW');

  pdf.save('curva_Voti.pdf');
}
}