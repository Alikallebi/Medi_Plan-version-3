import { Component, OnInit } from '@angular/core';
import { Produit } from 'src/app/demo/api/produit';
import { ProduitService } from 'src/app/demo/service/produit.service';
import { PhotoService } from 'src/app/demo/service/photo.service';


@Component({
    selector: 'app-media-demo',
    templateUrl: './mediademo.component.html'
})
export class MediaDemoComponent implements OnInit {

    products!: Produit[];

    images!: any[];

    galleriaResponsiveOptions: any[] = [
        {
            breakpoint: '1024px',
            numVisible: 5
        },
        {
            breakpoint: '960px',
            numVisible: 4
        },
        {
            breakpoint: '768px',
            numVisible: 3
        },
        {
            breakpoint: '560px',
            numVisible: 1
        }
    ];

    carouselResponsiveOptions: any[] = [
        {
            breakpoint: '1024px',
            numVisible: 3,
            numScroll: 3
        },
        {
            breakpoint: '768px',
            numVisible: 2,
            numScroll: 2
        },
        {
            breakpoint: '560px',
            numVisible: 1,
            numScroll: 1
        }
    ];

    constructor(private productService: ProduitService, private photoService: PhotoService) { }

    ngOnInit() {
       
    }
}
