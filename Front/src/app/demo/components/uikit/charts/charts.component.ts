import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { LayoutService } from 'src/app/layout/service/app.layout.service';
import { CommandeService } from 'src/app/demo/service/commande.service';

@Component({
    templateUrl: './charts.component.html'
})
export class ChartsComponent implements OnInit, OnDestroy {

    lineData: any;
    barData: any;
    pieData: any;
    polarData: any;
    radarData: any;
    doughnutData: any;

    lineOptions: any;
    barOptions: any;
    pieOptions: any;
    polarOptions: any;
    radarOptions: any;
    doughnutOptions: any;

    subscription!: Subscription;

    constructor(public layoutService: LayoutService, private commandeService: CommandeService) {
        this.subscription = this.layoutService.configUpdate$.subscribe(() => {
            this.initCharts();
        });
    }

    ngOnInit() {
        this.initCharts();
        this.loadSummaryData();
    }

    initCharts() {
        const documentStyle = getComputedStyle(document.documentElement);
        const textColor = documentStyle.getPropertyValue('--text-color');
        const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
        const surfaceBorder = documentStyle.getPropertyValue('--surface-border');

        this.barOptions = {
            plugins: {
                legend: {
                    labels: {
                        color: textColor
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: textColorSecondary,
                        font: {
                            weight: 500
                        }
                    },
                    grid: {
                        color: [surfaceBorder],
                        drawBorder: false
                    }
                },
                y: {
                    ticks: {
                        color: textColorSecondary
                    },
                    grid: {
                        color: [surfaceBorder],
                        drawBorder: false
                    }
                },
            }
        };

        this.lineOptions = {
            plugins: {
                legend: {
                    labels: {
                        color: textColor
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: textColorSecondary
                    },
                    grid: {
                        color: [surfaceBorder],
                        drawBorder: false
                    }
                },
                y: {
                    ticks: {
                        color: textColorSecondary
                    },
                    grid: {
                        color: [surfaceBorder],
                        drawBorder: false
                    }
                },
            }
        };

        // Dans la méthode initCharts() de ChartsComponent

        this.pieOptions = {
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true,
                        color: textColor,
                        generateLabels: function(chart: any) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label: any, i: number) => {
                                    const ds = data.datasets[0];
                                    const title = label !== undefined ? label + ': ' + ds.data[i] : 'undefined';
                                    return {
                                        text: title,
                                        fillStyle: ds.backgroundColor[i],
                                        hidden: isNaN(ds.data[i]),
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                }
            }
        };

        this.doughnutOptions = {
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true,
                        color: textColor,
                        generateLabels: function(chart: any) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label: any, i: number) => {
                                    const ds = data.datasets[0];
                                    const title = label !== undefined ? label + ': ' + ds.data[i] : 'undefined';
                                    return {
                                        text: title,
                                        fillStyle: ds.backgroundColor[i],
                                        hidden: isNaN(ds.data[i]),
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                }
            }
        };
    }

    

    loadSummaryData() {
        this.commandeService.getSummary().subscribe(data => {
            console.log('Summary Data:', data); // Vérifiez les données reçues
            this.updateChartData(data.commandesParDate, data.produitCommandes, data.packCommandes);
        });
    }
    

    updateChartData(commandesParDate: any[], produitCommandes: any[], packCommandes: any[]) {
        const documentStyle = getComputedStyle(document.documentElement);
        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        
        const chartLabels = commandesParDate.map(cmd => monthNames[cmd.month - 1]);
        const firstDatasetData = commandesParDate.map(cmd => cmd.totalCommandes);
        const secondDatasetData = commandesParDate.map(cmd => cmd.totalClients);
    
        this.barData = {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Total Commandes',
                    backgroundColor: documentStyle.getPropertyValue('--bluegray-700'),
                    borderColor: documentStyle.getPropertyValue('--bluegray-700'),
                    data: firstDatasetData
                },
                {
                    label: 'Total Clients',
                    backgroundColor: documentStyle.getPropertyValue('--green-600'),
                    borderColor: documentStyle.getPropertyValue('--green-600'),
                    data: secondDatasetData
                }
            ]
        };
    
        this.lineData = {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Total Commandes',
                    data: firstDatasetData,
                    fill: false,
                    backgroundColor: documentStyle.getPropertyValue('--bluegray-700'),
                    borderColor: documentStyle.getPropertyValue('--bluegray-700'),
                    tension: .4
                },
                {
                    label: 'Total Clients',
                    data: secondDatasetData,
                    fill: false,
                    backgroundColor: documentStyle.getPropertyValue('--green-600'),
                    borderColor: documentStyle.getPropertyValue('--green-600'),
                    tension: .4
                }
            ]
        };
    
        const pieLabels = produitCommandes.map(cmd => cmd.produitCommande);
        const pieData = produitCommandes.map(cmd => cmd.montantTotal);
    
        this.pieData = {
            labels: pieLabels,
            datasets: [
                {
                    data: pieData,
                    backgroundColor: [
                        documentStyle.getPropertyValue('--yellow-500'),
                        documentStyle.getPropertyValue('--blue-500'),
                        documentStyle.getPropertyValue('--pink-500'),
                        documentStyle.getPropertyValue('--green-500'),
                        documentStyle.getPropertyValue('--red-500')
                    ],
                    hoverBackgroundColor: [
                        documentStyle.getPropertyValue('--yellow-400'),
                        documentStyle.getPropertyValue('--blue-400'),
                        documentStyle.getPropertyValue('--pink-400'),
                        documentStyle.getPropertyValue('--green-400'),
                        documentStyle.getPropertyValue('--red-400')
                    ],
                }
            ]
        };
    
        // Correction ici : Utiliser packCommandes pour le Doughnut Chart
        const doughnutLabels = packCommandes.map(cmd => cmd.produitCommande);
        const doughnutData = packCommandes.map(cmd => cmd.montantTotal);
    
        this.doughnutData = {
            labels: doughnutLabels,
            datasets: [
                {
                    data: doughnutData,
                    backgroundColor: [
                        documentStyle.getPropertyValue('--purple-500'),
                        documentStyle.getPropertyValue('--orange-500'),
                        documentStyle.getPropertyValue('--cyan-500'),
                        documentStyle.getPropertyValue('--lime-500'),
                        documentStyle.getPropertyValue('--teal-500')
                    ],
                    hoverBackgroundColor: [
                        documentStyle.getPropertyValue('--purple-400'),
                        documentStyle.getPropertyValue('--orange-400'),
                        documentStyle.getPropertyValue('--cyan-400'),
                        documentStyle.getPropertyValue('--lime-400'),
                        documentStyle.getPropertyValue('--teal-400')
                    ],
                }
            ]
        };
    }
    
    
    ngOnDestroy() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
    }
}
