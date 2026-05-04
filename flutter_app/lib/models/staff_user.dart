import 'package:json_annotation/json_annotation.dart';
import 'package:equatable/equatable.dart';

part 'staff_user.g.dart';

@JsonSerializable()
class StaffUser extends Equatable {
  final int id;
  final String nom;
  final String prenom;
  final String email;
  final String role;
  final String? specialite;
  final int? serviceId;
  final String? serviceNom;
  final int? poleId;
  final String? poleNom;
  final int? equipeId;
  final String? equipeNom;
  final String? photo;
  final DateTime? dateNaissance;
  final String? telephone;
  final String? adresse;
  final DateTime? dateEmbauche;
  final bool? actif;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const StaffUser({
    required this.id,
    required this.nom,
    required this.prenom,
    required this.email,
    required this.role,
    this.specialite,
    this.serviceId,
    this.serviceNom,
    this.poleId,
    this.poleNom,
    this.equipeId,
    this.equipeNom,
    this.photo,
    this.dateNaissance,
    this.telephone,
    this.adresse,
    this.dateEmbauche,
    this.actif,
    this.createdAt,
    this.updatedAt,
  });

  factory StaffUser.fromJson(Map<String, dynamic> json) =>
      _$StaffUserFromJson(json);

  Map<String, dynamic> toJson() => _$StaffUserToJson(this);

  @override
  List<Object?> get props => [
    id,
    nom,
    prenom,
    email,
    role,
    specialite,
    serviceId,
    serviceNom,
    poleId,
    poleNom,
    equipeId,
    equipeNom,
    photo,
    dateNaissance,
    telephone,
    adresse,
    dateEmbauche,
    actif,
    createdAt,
    updatedAt,
  ];
}
